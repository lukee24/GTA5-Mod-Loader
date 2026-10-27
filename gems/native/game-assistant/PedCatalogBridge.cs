using System;
using System.Globalization;
using System.Linq;

namespace Gems.GameAssistant
{
    public sealed class PedCatalogBridge
    {
        private readonly string path;private readonly Func<string> actualRoot;
        public PedChoice[] Choices{get;private set;}=new PedChoice[0];public string Status{get;private set;}="尚未读取人物目录。";public string Detail{get;private set;}="";
        public PedCatalogBridge(string path):this(path,WeaponGameIdentity.ResolveCurrentProcessRoot){}
        internal PedCatalogBridge(string path,Func<string> actualRoot){this.path=path;this.actualRoot=actualRoot;}
        private bool Match(PedCatalog packet){var actual=WeaponGameIdentity.CanonicalGameRoot(actualRoot());return actual==packet.GameRoot&&WeaponGameIdentity.GameRootId(actual)==packet.GameRootId;}
        private static string Rejection(PedCatalogEntry r)=>r.FileState!="verified"||r.TransactionId==null?"对应安装文件未核验":r.Registration=="not-registered"?"声明尚未注册":r.Dependencies=="missing"?"声明缺少依赖":"";
        private static string Token(PedCatalog p,PedCatalogEntry r)=>p.Revision+":"+p.ContentDigest+":"+r.Id;
        public void Refresh(){Choices=new PedChoice[0];try{var p=PedCatalog.Read(path);var matched=Match(p);Choices=p.Peds.Select(r=>new PedChoice(r.Id,r.ModelName,uint.Parse(r.Hash,NumberStyles.HexNumber,CultureInfo.InvariantCulture),Token(p,r),"catalog",matched&&Rejection(r)=="",!matched?"目录与当前宿主根不匹配":Rejection(r),r.UserTags.FirstOrDefault()??"mod",false,r.DesktopFavorite,r.UserTags.ToArray())).ToArray();Status=matched?"人物目录根匹配；注册/依赖和效果仍待验证。":"人物目录根不匹配，禁止目录动作。";Detail=string.Join("\n",p.Issues.Concat(p.Peds.SelectMany(r=>r.Issues)));}catch(Exception ex){Status="人物目录未读取；原版候选仍独立可用。";Detail=ex.ToString();}}
        public void Validate(PedChoice c)
        {
            if(c.Source=="builtin"){var known=BuiltinPeds.Choices.SingleOrDefault(x=>x.Id==c.Id);if(known==null||known.Token!=c.Token||known.Hash!=c.Hash)throw new InvalidOperationException("原版人物候选身份改变。");return;}
            if(c.Source!="catalog")throw new InvalidOperationException("未知人物来源。");var p=PedCatalog.Read(path);if(!Match(p))throw new InvalidOperationException("人物目录与宿主根不匹配。");var row=p.Peds.SingleOrDefault(r=>r.Id==c.Id);
            if(row==null||Token(p,row)!=c.Token||uint.Parse(row.Hash,NumberStyles.HexNumber,CultureInfo.InvariantCulture)!=c.Hash||Rejection(row)!="")throw new InvalidOperationException("人物目录内容/状态改变，请刷新并重新选择。");
        }
    }
    public static class BuiltinPeds
    {
        private static PedChoice Candidate(string name,string category,bool animal=false)=>new PedChoice("builtin:"+name,name,GTA.StringHash.AtStringHashUtf8(name,0),"builtin-ped-v1:"+name,"builtin",true,"固定候选；引擎识别/模型准备后仍需实测。",category,animal);
        public static readonly PedChoice[] Choices={Candidate("s_m_y_marine_01","military"),Candidate("s_m_y_marine_02","military"),Candidate("s_m_y_cop_01","police"),Candidate("s_f_y_cop_01","police"),Candidate("a_m_y_business_01","civilian"),Candidate("a_f_y_business_01","civilian"),Candidate("a_c_rottweiler","animal",true),Candidate("a_c_cow","animal",true),Candidate("a_c_deer","animal",true)};
    }
}
