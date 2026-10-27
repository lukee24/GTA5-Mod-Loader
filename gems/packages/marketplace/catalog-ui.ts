// Pure renderer-facing data: never bundle the HTML parser or network client into the renderer.
import type {CatalogItem} from './catalog';
export const catalogCategories={'车辆':'vehicles','人物':'player','武器':'weapons','地图与房产':'maps','脚本与玩法':'scripts','图形与环境':'misc','工具':'tools'} as const;
export const catalogKinds={'全部载具':'','汽车':'car','摩托车':'bike','飞机':'aircraft','直升机':'helicopter','船舶':'boat','卡车':'truck','巴士':'bus','军用载具':'tank'} as const;
export function catalogFacets(items:CatalogItem[]){return{types:[...new Set(items.flatMap(item=>item.vehicleTypes))].sort(),tags:[...new Set(items.flatMap(item=>item.tags))].sort()};}
