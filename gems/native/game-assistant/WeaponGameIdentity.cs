using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32.SafeHandles;

namespace Gems.GameAssistant
{
    public sealed class WeaponGameIdentity
    {
        private readonly Func<string> actualHostRoot;
        public WeaponGameIdentity() : this(ResolveCurrentProcessRoot) { }
        // Test seam supplies an already-resolved OS root, not a catalogue-selected path.
        internal WeaponGameIdentity(Func<string> actualHostRoot) { this.actualHostRoot = actualHostRoot ?? throw new ArgumentNullException(nameof(actualHostRoot)); }
        public bool Match(WeaponCatalog catalog, out string reason)
        {
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            try
            {
                var actual = CanonicalGameRoot(actualHostRoot());
                if (!string.Equals(actual, catalog.GameRoot, StringComparison.Ordinal) || !string.Equals(GameRootId(actual), catalog.GameRootId, StringComparison.Ordinal))
                { reason = "目录与当前 GTA V Enhanced 进程的实际根目录不匹配；目录动作已拒绝。"; return false; }
                reason = "目录根身份匹配；文件状态不证明游戏注册、加载或功能可用。"; return true;
            }
            catch (Exception error) when (error is InvalidDataException || error is IOException || error is UnauthorizedAccessException || error is Win32Exception || error is ArgumentException || error is InvalidOperationException || error is NotSupportedException)
            { reason = "无法确认当前 GTA V Enhanced 进程根身份；目录动作已拒绝。"; return false; }
        }
        internal static string ResolveCurrentProcessRoot()
        {
            using (var process = Process.GetCurrentProcess())
            {
                var executable = process.MainModule?.FileName;
                if (string.IsNullOrEmpty(executable) || !string.Equals(Path.GetFileName(executable), "GTA5_Enhanced.exe", StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("宿主进程不是 GTA5_Enhanced.exe。");
                var parent = Path.GetDirectoryName(executable) ?? throw new InvalidDataException("宿主进程根目录不存在。");
                using (var directories = WeaponPath.PinDirectories(parent))
                using (var file = WeaponPath.OpenPlainFile(executable!, false))
                { return CanonicalGameRoot(directories.Resolved); }
            }
        }
        public static string CanonicalGameRoot(string value)
        {
            var path = WeaponJson.Text(value, 32768).Replace('/', '\\');
            if (path.StartsWith("\\\\?\\UNC\\", StringComparison.Ordinal)) path = "\\\\" + path.Substring(8);
            else if (path.StartsWith("\\\\?\\", StringComparison.Ordinal)) path = path.Substring(4);
            int rootLength;
            if (Regex.IsMatch(path, "\\A[A-Za-z]:\\\\", RegexOptions.CultureInvariant)) rootLength = 3;
            else if (path.StartsWith("\\\\", StringComparison.Ordinal) && !path.StartsWith("\\\\.\\", StringComparison.Ordinal))
            {
                var server = path.IndexOf('\\', 2); var share = server < 0 ? -1 : path.IndexOf('\\', server + 1);
                if (server <= 2 || share <= server + 1) throw WeaponJson.Bad("UNC 根目录不完整或未规范化。"); rootLength = share + 1;
            }
            else throw WeaponJson.Bad("游戏根目录不是完整普通绝对路径。");
            while (path.Length > rootLength && path.EndsWith("\\", StringComparison.Ordinal)) path = path.Substring(0, path.Length - 1);
            var relative = path.Substring(rootLength);
            if (relative.Length > 0) foreach (var part in relative.Split('\\'))
                if (part.Length == 0 || part == "." || part == "..") throw WeaponJson.Bad("游戏根目录尚未规范化。");
            if (path.IndexOf('\0') >= 0) throw WeaponJson.Bad("游戏根目录无效。");
            return path;
        }
        public static string GameRootId(string value) => Digest(new UTF8Encoding(false, true).GetBytes(CanonicalGameRoot(value)));
        internal static string Digest(byte[] bytes)
        { using (var hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(); }
    }

    // All file-system operations are read-only. Ancestors remain pinned until the read completes.
    internal static class WeaponPath
    {
        internal sealed class Pins : IDisposable
        {
            internal readonly List<SafeFileHandle> Handles = new List<SafeFileHandle>();
            internal string Resolved = "";
            public void Dispose() { foreach (var handle in Handles) handle.Dispose(); }
        }
        internal static Pins PinDirectories(string path)
        {
            var result = new Pins();
            try
            {
                var chain = new List<string>();
                for (var current = Path.GetFullPath(path); !string.IsNullOrEmpty(current); current = Path.GetDirectoryName(current)) chain.Add(current);
                chain.Reverse();
                foreach (var current in chain)
                {
                    // FILE_READ_ATTRIBUTES alone does not participate in Windows sharing checks.
                    // GENERIC_READ pins each directory against rename/write until disposal.
                    var handle = CreateFile(NativePath(current), 0x80000000, 1, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
                    if (handle.IsInvalid) { var error = Marshal.GetLastWin32Error(); handle.Dispose(); throw new IOException("无法固定武器目录路径。", new Win32Exception(error)); }
                    result.Handles.Add(handle); var info = Information(handle);
                    if ((info.FileAttributes & 0x400) != 0 || (info.FileAttributes & 0x10) == 0) throw WeaponJson.Bad("目录路径包含重解析点或非目录。");
                    var resolved = FinalPath(handle);
                    if (!string.Equals(resolved.TrimEnd('\\'), WeaponGameIdentity.CanonicalGameRoot(current).TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) throw WeaponJson.Bad("目录实际路径与请求路径不一致。");
                    result.Resolved = resolved;
                }
                return result;
            }
            catch { result.Dispose(); throw; }
        }
        internal static SafeFileHandle OpenPlainFile(string path, bool read)
        {
            var handle = CreateFile(NativePath(path), read ? 0x80000000u : 0x80u, 5, IntPtr.Zero, 3, 0x00200000, IntPtr.Zero);
            if (handle.IsInvalid) { var error = Marshal.GetLastWin32Error(); handle.Dispose(); throw new IOException("无法读取武器目录文件。", new Win32Exception(error)); }
            try
            {
                var info = Information(handle);
                if ((info.FileAttributes & (0x400 | 0x10)) != 0 || info.NumberOfLinks != 1) throw WeaponJson.Bad("文件必须为普通文件，禁止链接。");
                return handle;
            }
            catch { handle.Dispose(); throw; }
        }
        internal static byte[] ReadFile(string path, int max)
        {
            var absolute = Path.GetFullPath(path); var parent = Path.GetDirectoryName(absolute) ?? throw WeaponJson.Bad("目录文件路径无效。");
            using (var directories = PinDirectories(parent))
            using (var handle = OpenPlainFile(absolute, true))
            using (var stream = new FileStream(handle, FileAccess.Read))
            {
                if (stream.Length == 0 || stream.Length > max) throw WeaponJson.Bad("文件为空或超过 2 MiB。");
                var bytes = new byte[(int)stream.Length]; var at = 0;
                while (at < bytes.Length) { var read = stream.Read(bytes, at, bytes.Length - at); if (read == 0) throw new EndOfStreamException("武器目录读取不完整。"); at += read; }
                if (stream.Length != bytes.Length || stream.ReadByte() != -1) throw WeaponJson.Bad("读取期间文件长度变化。");
                return bytes;
            }
        }
        private static string NativePath(string path)
        {
            var full = Path.GetFullPath(path); if (full.StartsWith("\\\\?\\", StringComparison.Ordinal)) return full;
            return full.StartsWith("\\\\", StringComparison.Ordinal) ? "\\\\?\\UNC\\" + full.Substring(2) : "\\\\?\\" + full;
        }
        private static FileInformation Information(SafeFileHandle handle)
        { if (!GetFileInformationByHandle(handle, out var result)) throw new IOException("无法读取目录文件身份。", new Win32Exception(Marshal.GetLastWin32Error())); return result; }
        private static string FinalPath(SafeFileHandle handle)
        {
            var buffer = new StringBuilder(32768); var size = GetFinalPathNameByHandle(handle, buffer, buffer.Capacity, 0);
            if (size == 0 || size >= buffer.Capacity) throw new IOException("无法读取实际目录路径。", new Win32Exception(Marshal.GetLastWin32Error()));
            return WeaponGameIdentity.CanonicalGameRoot(buffer.ToString());
        }
        [StructLayout(LayoutKind.Sequential)]
        private struct FileInformation
        {
            public uint FileAttributes;
            public System.Runtime.InteropServices.ComTypes.FILETIME CreationTime, LastAccessTime, LastWriteTime;
            public uint VolumeSerialNumber, FileSizeHigh, FileSizeLow, NumberOfLinks, FileIndexHigh, FileIndexLow;
        }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern uint GetFinalPathNameByHandle(SafeFileHandle handle, StringBuilder path, int capacity, uint flags);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out FileInformation information);
    }
}
