// 分类来自作者发布文字的关键词，只供浏览筛选；实际类型由下载后的资源扫描确认。
export const vehicleBrands = ['奔驰','迈巴赫','宝马','奥迪','保时捷','法拉利','兰博基尼','迈凯伦','阿斯顿·马丁','劳斯莱斯','宾利','布加迪','帕加尼','科尔维特','路虎','凯迪拉克','小米汽车','丰田','雷克萨斯','日产','本田','福特','雪佛兰','道奇','特斯拉'];
export const vehicleTypes = ['轿车','轿跑','跑车','超级跑车','SUV','越野车','皮卡','卡车','巴士','赛车','摩托车','飞机','直升机','船舶','军用载具'];
const brandRules = [/mercedes|奔驰/i,/maybach|迈巴赫/i,/\bbmw\b|宝马/i,/\baudi\b|奥迪/i,/porsche|保时捷/i,/ferrari|法拉利/i,/lamborghini|兰博基尼/i,/mclaren|迈凯伦/i,/aston martin|阿斯顿/i,/rolls.?royce|劳斯莱斯/i,/bentley|宾利/i,/bugatti|布加迪/i,/pagani|帕加尼/i,/corvette|科尔维特/i,/land rover|range rover|路虎/i,/cadillac|凯迪拉克/i,/xiaomi|小米/i,/toyota|丰田/i,/lexus|雷克萨斯/i,/nissan|日产/i,/honda|本田/i,/\bford\b|福特/i,/chevrolet|雪佛兰/i,/dodge|道奇/i,/tesla|特斯拉/i];
const typeRules = [/sedan|saloon|轿车/i,/coupe|coupé|轿跑/i,/sports.?car|跑车/i,/supercar|hypercar|超级跑车/i,/\bsuv\b/i,/off.?road|越野/i,/pickup|皮卡/i,/truck|卡车/i,/\bbus\b|coach|巴士/i,/race|racing|赛车/i,/motorcycle|motorbike|摩托/i,/aircraft|airplane|飞机/i,/helicopter|直升机/i,/boat|yacht|ship|船舶/i,/military|\btank\b|军用/i];
export const modCategories = ['车辆','人物','武器','地图与房产','脚本与玩法','图形与环境','音效','工具','其他'];
export function classify(text:string) {
  const brands=vehicleBrands.filter((_,i)=>brandRules[i].test(text));
  const types=vehicleTypes.filter((_,i)=>typeRules[i].test(text));
  const categories:string[]=[];
  if(brands.length||types.length||/vehicle|handling|汽车|载具/i.test(text))categories.push('车辆');
  if(/ped\b|character|clothing|人物|服装/i.test(text))categories.push('人物');
  if(/weapon|武器/i.test(text))categories.push('武器');
  if(/\bmlo\b|\bymap\b|mansion|地图|豪宅/i.test(text))categories.push('地图与房产');
  if(/script|trainer|scripthook|脚本|修改器/i.test(text))categories.push('脚本与玩法');
  if(/reshade|weather|visual|nve|图形|天气/i.test(text))categories.push('图形与环境');
  if(/audio|sound|音效/i.test(text))categories.push('音效');
  if(/tool|editor|工具/i.test(text))categories.push('工具');
  return {categories:categories.length?categories:['其他'],brands,vehicleTypes:types};
}
