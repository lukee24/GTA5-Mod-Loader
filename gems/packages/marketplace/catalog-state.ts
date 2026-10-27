import type {CatalogPage,CatalogQuery} from './catalog';

export interface CatalogRequest {id:number;query:CatalogQuery;refresh:boolean;}
export interface CatalogState {
  request:CatalogRequest;
  status:'loading'|'ready'|'failed';
  page:CatalogPage|null;
  issue:string;
}
export type CatalogAction =
  | {type:'select';query:CatalogQuery}
  | {type:'refresh'|'next'|'retry'}
  | {type:'loaded';id:number;page:CatalogPage}
  | {type:'failed';id:number;message:string};

export function createCatalogState():CatalogState {
  return {request:{id:1,query:{category:'车辆',kind:'全部载具',brand:'全部品牌',page:1},refresh:false},status:'loading',page:null,issue:''};
}
function sameQuery(a:CatalogQuery,b:CatalogQuery){return a.category===b.category&&a.kind===b.kind&&a.brand===b.brand;}
function start(state:CatalogState,query:CatalogQuery,refresh:boolean,clear:boolean):CatalogState {
  return {request:{id:state.request.id+1,query:{...query},refresh},status:'loading',page:clear?null:state.page,issue:''};
}
export function catalogReducer(state:CatalogState,action:CatalogAction):CatalogState {
  switch(action.type){
    case 'select':return start(state,{...action.query,page:1},false,true);
    case 'refresh':return start(state,{...state.request.query,page:1},true,true);
    case 'retry':return state.status==='failed'?start(state,state.request.query,state.request.refresh,false):state;
    case 'next':
      if(state.status!=='ready'||!state.page?.hasNext||state.page.query.page>=20)return state;
      return start(state,{...state.page.query,page:state.page.query.page+1},false,false);
    case 'failed':
      return action.id===state.request.id&&state.status==='loading'?{...state,status:'failed',issue:action.message}:state;
    case 'loaded':{
      if(action.id!==state.request.id||state.status!=='loading')return state;
      const query=state.request.query,next=action.page;
      if(!sameQuery(query,next.query)||query.page!==next.query.page||
        (query.page>1&&(!state.page||!sameQuery(state.page.query,query)||state.page.query.page+1!==query.page)))
        return {...state,status:'failed',issue:'目录响应与请求页不一致，请重试当前页'};
      // New metadata wins for repeated IDs, without moving existing cards or claiming an extra distinct item.
      const items=new Map((query.page===1?[]:state.page!.items).map(item=>[item.id,item]));
      for(const item of next.items)items.set(item.id,item);
      return {...state,status:'ready',issue:'',page:{...next,items:[...items.values()]}};
    }
  }
}
