// Calamity: цели квестов, которые FTB Quests не умеет проверять сам («что угодно»).
// Скрипт выдаёт скрытые достижения calamity:quest/<имя>, а квест FTB ждёт их как цель «достижение».

const $DataComponents = Java.loadClass('net.minecraft.core.component.DataComponents')

// Моды с готовкой: блюдо отсюда (или ванильный суп/рагу) засчитывается как «приготовленное»
const COOKING_MODS = {
  farmersdelight: true, farm_and_charm: true, candlelight: true, culturaldelights: true, fruitsdelight: true,
  cookscollection: true, aquaculturedelight: true, displaydelight: true
}
const VANILLA_DISHES = {
  'minecraft:mushroom_stew': true, 'minecraft:rabbit_stew': true, 'minecraft:beetroot_soup': true,
  'minecraft:suspicious_stew': true, 'minecraft:pumpkin_pie': true, 'minecraft:cake': true
}
const MIN_NUTRITION = 5   // сырые овощи и фрукты из тех же модов не считаются блюдом

function grant(player, name) {
  if (!player || !player.server) return
  let key = 'calamity_quest_' + name
  if (player.persistentData.getBoolean(key)) return
  player.persistentData.putBoolean(key, true)
  player.server.runCommandSilent('advancement grant ' + player.username + ' only calamity:quest/' + name)
}

// Посадить что угодно: грядки, саженцы, ягодные кусты
BlockEvents.placed(event => {
  let p = event.player
  if (!p) return
  let b = event.block
  if (b.hasTag('minecraft:crops') || b.hasTag('minecraft:saplings') || b.hasTag('c:crops') || /_crop|_bush$|sapling/.test(String(b.id)))
    grant(p, 'planted')
})

// Любой котелок / сковорода / жаровня в инвентаре
PlayerEvents.inventoryChanged(event => {
  if (event.item.hasTag('calamity:cooking_stations')) grant(event.player, 'cooking_station')
  if (String(event.item.id).indexOf('relics_rpgs:') == 0) grant(event.player, 'relic')   // любая реликвия RPG Series Relics
})

// Съесть приготовленное блюдо
ItemEvents.foodEaten(event => {
  let p = event.player || event.entity
  let id = String(event.item.id)
  let ns = id.split(':')[0]
  let nutrition = 0
  try {
    let food = event.item.get($DataComponents.FOOD)
    if (food != null) nutrition = typeof food.nutrition === 'function' ? food.nutrition() : food.nutrition
  } catch (e) { nutrition = 0 }
  if (VANILLA_DISHES[id] || (COOKING_MODS[ns] && nutrition >= MIN_NUTRITION)) grant(p, 'ate_dish')
})
