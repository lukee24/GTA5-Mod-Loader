using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Gems.GameAssistant
{
    public sealed class PedFavoritesSnapshot
    {
        public readonly string Revision;public readonly IReadOnlyDictionary<string,string> Entries;
        internal PedFavoritesSnapshot(string revision,Dictionary<string,string> entries){Revision=revision;Entries=new System.Collections.ObjectModel.ReadOnlyDictionary<string,string>(entries);}
        public bool Has(PedChoice choice)=>Entries.TryGetValue(choice.Id,out var token)&&token==choice.Token;
    }
    // Independent immutable history; no mutable current file, game entity or vehicle favorite is reused.
    public sealed class PedFavoriteStore
    {
        private const string Prefix="ped-favorites-",Marker="GEMS.PedFavorites.v1";private readonly string directory;
        internal Action? BeforePublish;
        public PedFavoriteStore(string directory){this.directory=Path.GetFullPath(directory);if(Path.GetDirectoryName(this.directory)==null)throw new ArgumentException("人物收藏不可使用根目录。");}
        private sealed class History:IDisposable
        {internal readonly List<FileStream> Handles=new List<FileStream>();internal int Count;internal string Revision="empty";internal Dictionary<string,string> Entries=new Dictionary<string,string>(StringComparer.Ordinal);public void Dispose(){foreach(var f in Handles)f.Dispose();}internal PedFavoritesSnapshot Snapshot()=>new PedFavoritesSnapshot(Revision,new Dictionary<string,string>(Entries,StringComparer.Ordinal));}
        private static void Identity(string id,string token){if(id.Length<1||id.Length>160||token.Length<1||token.Length>300||id.Any(c=>c<33||c>126)||token.Any(c=>c<33||c>126))throw new InvalidDataException("人物收藏身份格式无效。");}
        private static string Name(int n,string hash)=>Prefix+n.ToString("D8",CultureInfo.InvariantCulture)+"-"+hash+".txt";
        private static byte[] Bytes(int n,string parent,Dictionary<string,string> entries){var text=Marker+"\n"+n.ToString(CultureInfo.InvariantCulture)+"\n"+parent+"\n"+entries.Count.ToString(CultureInfo.InvariantCulture)+"\n"+(entries.Count==0?"":string.Join("\n",entries.OrderBy(p=>p.Key,StringComparer.Ordinal).Select(p=>Convert.ToBase64String(Encoding.UTF8.GetBytes(p.Key))+":"+Convert.ToBase64String(Encoding.UTF8.GetBytes(p.Value))))+"\n");var bytes=Encoding.UTF8.GetBytes(text);if(bytes.Length>131072)throw new InvalidDataException("人物收藏快照超过128KiB。");return bytes;}
        private History ReadHistory()
        {
            var history=new History();try{
                var all=Directory.GetFiles(directory);if(all.Length>1025||Directory.GetDirectories(directory).Length!=0)throw new InvalidDataException("人物收藏文件数量或目录结构超限。");
                var files=all.Where(p=>Path.GetFileName(p).StartsWith(Prefix,StringComparison.Ordinal)&&p.EndsWith(".txt",StringComparison.Ordinal)).OrderBy(p=>p,StringComparer.Ordinal).ToArray();
                if(files.Length>512)throw new InvalidDataException("人物收藏历史达到512版上限。");
                foreach(var f in all){var name=Path.GetFileName(f);if(name!=".ped-favorites.lock"&&!files.Contains(f)&&!(name.StartsWith(Prefix,StringComparison.Ordinal)&&name.EndsWith(".tmp",StringComparison.Ordinal)))throw new InvalidDataException("人物收藏目录含未知文件，已保留。");RejectLinks(f);}
                foreach(var file in files){var handle=Open(file,0x80000000,1,3);var stream=new FileStream(handle,FileAccess.Read);history.Handles.Add(stream);if(stream.Length<1||stream.Length>131072)throw new InvalidDataException("人物收藏历史大小无效。");var bytes=new byte[(int)stream.Length];var at=0;while(at<bytes.Length){var read=stream.Read(bytes,at,bytes.Length-at);if(read==0)throw new EndOfStreamException();at+=read;}if(stream.ReadByte()!=-1)throw new InvalidDataException("人物收藏读取期间长度变化。");var text=new UTF8Encoding(false,true).GetString(bytes);var lines=text.Split('\n');var hash=WeaponGameIdentity.Digest(bytes);var seq=++history.Count;
                    if(lines.Length<5||lines[0]!=Marker||lines[1]!=seq.ToString(CultureInfo.InvariantCulture)||lines[2]!=history.Revision||Path.GetFileName(file)!=Name(seq,hash)||lines[lines.Length-1]!=""||!int.TryParse(lines[3],NumberStyles.None,CultureInfo.InvariantCulture,out var count)||count<0||count>256||lines.Length!=count+5)throw new InvalidDataException("人物收藏历史损坏或存在分支；未重置。");
                    var values=new Dictionary<string,string>(StringComparer.Ordinal);for(int i=0;i<count;i++){var parts=lines[i+4].Split(':');if(parts.Length!=2)throw new InvalidDataException("人物收藏项目无效。");var id=new UTF8Encoding(false,true).GetString(Convert.FromBase64String(parts[0]));var token=new UTF8Encoding(false,true).GetString(Convert.FromBase64String(parts[1]));Identity(id,token);values.Add(id,token);}history.Entries=values;history.Revision=hash;
                }return history;
            }catch{history.Dispose();throw;}
        }
        public PedFavoritesSnapshot Read()
        {RejectLinks(directory);if(!Directory.Exists(directory)){if(File.Exists(directory))throw new IOException("人物收藏目录被文件占用。");return new PedFavoritesSnapshot("empty",new Dictionary<string,string>());}using(var pins=PinDirectories(directory))using(var gate=new FileStream(Open(Path.Combine(directory,".ped-favorites.lock"),0xC0000000,0,4),FileAccess.ReadWrite))using(var h=ReadHistory())return h.Snapshot();}
        public PedFavoritesSnapshot Toggle(string expected,PedChoice choice)
        {
            Identity(choice.Id,choice.Token);var parent=Path.GetDirectoryName(directory)!;RejectLinks(directory);using(var parents=PinDirectories(parent)){Directory.CreateDirectory(directory);using(var pins=PinDirectories(directory))using(var gate=new FileStream(Open(Path.Combine(directory,".ped-favorites.lock"),0xC0000000,0,4),FileAccess.ReadWrite))using(var h=ReadHistory()){
                if(h.Revision!=expected)throw new InvalidDataException("人物收藏已变化，请刷新后重试。");if(h.Count>=512)throw new InvalidDataException("人物收藏历史已到512版，未删除历史。");var items=new Dictionary<string,string>(h.Entries,StringComparer.Ordinal);if(items.TryGetValue(choice.Id,out var existing)&&existing==choice.Token)items.Remove(choice.Id);else items[choice.Id]=choice.Token;if(items.Count>256)throw new InvalidDataException("人物收藏超过256项。");
                var bytes=Bytes(h.Count+1,h.Revision,items);var revision=WeaponGameIdentity.Digest(bytes);var target=Path.Combine(directory,Name(h.Count+1,revision));var attempted=false;
                try{using(var temp=CreateOwnedTemporary(Path.Combine(directory,Prefix+Guid.NewGuid().ToString("N")+".tmp"))){temp.Write(bytes,0,bytes.Length);temp.Flush(true);BeforePublish?.Invoke();using(var current=ReadHistory())if(current.Revision!=h.Revision)throw new InvalidDataException("人物收藏发布前出现并发变化。");attempted=true;RenameOwned(temp.SafeFileHandle,target);}using(var committed=ReadHistory()){if(committed.Revision!=revision)throw new InvalidDataException("人物收藏发布后出现分支。");return committed.Snapshot();}}
                catch(Exception ex){if(!attempted)throw;throw new IOException("人物收藏发布结果未确认；请刷新，不视为回滚或自动重试。",ex);}
            }}
        }
        private static SafeFileHandle Open(string path,uint access,uint share,uint creation){var h=CreateFile(NativePath(path),access,share,IntPtr.Zero,creation,0x00200000,IntPtr.Zero);if(h.IsInvalid){var e=Marshal.GetLastWin32Error();h.Dispose();throw new IOException("无法打开人物收藏文件。",new Win32Exception(e));}try{if(!GetFileInformationByHandle(h,out var info)||(info.FileAttributes&(0x400|0x10))!=0||info.NumberOfLinks!=1)throw new InvalidDataException("人物收藏文件非独立普通文件。");return h;}catch{h.Dispose();throw;}}
        private static void RejectLinks(string path)=>BridgeCatalog.RejectLinks(path);
        private static FileStream CreateOwnedTemporary(string path)
        {
            RejectLinks(path);
            var handle = CreateFile(NativePath(path), 0xC0010000, 1, IntPtr.Zero, 1, 0x80, IntPtr.Zero);
            if (handle.IsInvalid) { var error = Marshal.GetLastWin32Error(); handle.Dispose(); throw new IOException("无法创建人物收藏临时文件。", new Win32Exception(error)); }
            try { return new FileStream(handle, FileAccess.ReadWrite); } catch { handle.Dispose(); throw; }
        }
        private static void RenameOwned(SafeFileHandle handle, string target)
        {
            var name = Encoding.Unicode.GetBytes(NativePath(target));
            var rootOffset = IntPtr.Size == 8 ? 8 : 4; var lengthOffset = rootOffset + IntPtr.Size; var nameOffset = lengthOffset + 4;
            // Win32 resolves the supplied path as UTF-16 before passing it to NT. Keep
            // an explicit NUL beyond FileNameLength; otherwise it may read allocator tail bytes.
            var size = nameOffset + name.Length + 2;
            var buffer = Marshal.AllocHGlobal(size);
            try
            {
                for (var i = 0; i < nameOffset; i++) Marshal.WriteByte(buffer, i, 0);
                Marshal.WriteInt32(buffer, lengthOffset, name.Length); Marshal.Copy(name, 0, IntPtr.Add(buffer, nameOffset), name.Length); Marshal.WriteInt16(buffer, nameOffset + name.Length, 0);
                if (!SetFileInformationByHandle(handle, 3, buffer, (uint)size)) throw new IOException("人物收藏原子发布失败。", new Win32Exception(Marshal.GetLastWin32Error()));
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }
        private static void WriteNew(string path, byte[] bytes)
        {
            using (var stream = CreateOwnedTemporary(path + "." + Guid.NewGuid().ToString("N") + ".tmp"))
            { stream.Write(bytes, 0, bytes.Length); stream.Flush(true); RenameOwned(stream.SafeFileHandle, path); }
        }
        private static string NativePath(string path)
        {
            var full = Path.GetFullPath(path);
            if (full.StartsWith("\\\\?\\", StringComparison.Ordinal)) return full;
            return full.StartsWith("\\\\", StringComparison.Ordinal) ? "\\\\?\\UNC\\" + full.Substring(2) : "\\\\?\\" + full;
        }

        private sealed class DirectoryPins : IDisposable
        {
            public readonly List<SafeFileHandle> Handles = new List<SafeFileHandle>();
            public void Dispose() { foreach (var handle in Handles) handle.Dispose(); }
        }
        private static DirectoryPins PinDirectories(string path)
        {
            var pins = new DirectoryPins();
            try
            {
                var chain = new List<string>();
                for (var current = Path.GetFullPath(path); !string.IsNullOrEmpty(current); current = Path.GetDirectoryName(current)) chain.Add(current);
                chain.Reverse();
                foreach (var current in chain)
                {
                    RejectLinks(current);
                    var handle = CreateFile(NativePath(current), 0, 3, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero);
                    if (handle.IsInvalid) { var error = Marshal.GetLastWin32Error(); handle.Dispose(); throw new IOException("无法固定人物收藏目录。", new Win32Exception(error)); }
                    pins.Handles.Add(handle);
                    var resolved = new StringBuilder(32768); var length = GetFinalPathNameByHandle(handle, resolved, resolved.Capacity, 0);
                    if (length == 0 || length >= resolved.Capacity) throw new IOException("无法核对人物收藏目录的实际路径。", new Win32Exception(Marshal.GetLastWin32Error()));
                    var value = resolved.ToString();
                    if (value.StartsWith("\\\\?\\UNC\\", StringComparison.Ordinal)) value = "\\\\" + value.Substring(8);
                    else if (value.StartsWith("\\\\?\\", StringComparison.Ordinal)) value = value.Substring(4);
                    if (!string.Equals(value.TrimEnd('\\', '/'), current.TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("人物收藏目录的实际路径发生变化。");
                }
                return pins;
            }
            catch { pins.Dispose(); throw; }
        }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern uint GetFinalPathNameByHandle(SafeFileHandle handle, StringBuilder path, int capacity, uint flags);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetFileInformationByHandle(SafeFileHandle handle, int informationClass, IntPtr information, uint size);
        [StructLayout(LayoutKind.Sequential)]
        private struct FileInformation
        {
            public uint FileAttributes;
            public System.Runtime.InteropServices.ComTypes.FILETIME CreationTime, LastAccessTime, LastWriteTime;
            public uint VolumeSerialNumber, FileSizeHigh, FileSizeLow, NumberOfLinks, FileIndexHigh, FileIndexLow;
        }
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out FileInformation information);
    }
}
