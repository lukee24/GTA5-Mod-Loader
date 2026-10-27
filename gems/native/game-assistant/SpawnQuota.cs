using System;
using System.Collections.Generic;
using System.Linq;

namespace Gems.GameAssistant
{
    // Capacity only, never entity ownership. Lost authority does not imply a vacant slot.
    public sealed class SpawnQuota
    {
        private sealed class Batch { internal string Kind=""; internal int[] Slots=new int[0]; }
        private readonly Dictionary<string,Batch> batches=new Dictionary<string,Batch>(); private string? active;
        public int Charged=>batches.Values.Sum(b=>b.Slots.Count(s=>s!=0));
        public string Reserve(string kind,int count)
        {
            if(count<1||count>4||Charged+count>16)throw new InvalidOperationException("本实例已提交/未知对象与预约合计达到16项限制。");
            if(active!=null)throw new InvalidOperationException("已有车辆或人物创建请求，请先完成或取消。");
            var id=Guid.NewGuid().ToString("N");batches.Add(id,new Batch{Kind=kind,Slots=Enumerable.Repeat(1,count).ToArray()});active=id;return id;
        }
        public void Require(string id,int index){if(!batches.TryGetValue(id,out var b)||active!=id||index<0||index>=b.Slots.Length||b.Slots[index]!=1)throw new InvalidOperationException("创建预约已失效或消费。");}
        public void Issue(string id,int index){Require(id,index);batches[id].Slots[index]=2;}
        private void Prune(string id){if(active!=id&&batches.TryGetValue(id,out var b)&&b.Slots.All(s=>s==0))batches.Remove(id);}
        public void End(string id){if(batches.TryGetValue(id,out var b))for(int i=0;i<b.Slots.Length;i++)if(b.Slots[i]==1)b.Slots[i]=0;if(active==id)active=null;Prune(id);}
        public void ConfirmDeleted(string id,int index){if(batches.TryGetValue(id,out var b)&&index>=0&&index<b.Slots.Length&&b.Slots[index]==2)b.Slots[index]=0;Prune(id);}
    }
}
