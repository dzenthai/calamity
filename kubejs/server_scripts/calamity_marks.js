// Calamity: контрольные точки — столб золотого света, который видно издалека (block_display со свечением,
// контур виден сквозь блоки, пока сущность отслеживается клиентом: ~160 блоков).
// Все server_scripts выполняются в одной области видимости, поэтому CalamityMarks доступен из других файлов:
//   CalamityMarks.add(server, playerName, id, x, y, z, reach)  ставит точку в измерении игрока
//   CalamityMarks.remove(server, id)                          убирает точку
//   CalamityMarks.onReach[id] = (server, player) => {...}     вызывается, когда игрок подошёл ближе reach блоков
// Точка без reach (0) только показывает место; её убирает сам сюжет (как у тела Кайрена).
// Ограничение: точки видны всем игрокам на сервере, а не только тому, для кого поставлены.

const MARK_TAG = 'calamity_mark'
const MARK_HEIGHT = 64
const MARK_WIDTH = 0.4
const MARK_GLOW = 0xF2C55C   // золото, как текст катсцен

// KubeJS 2101 отдаёт часть геттеров только как свойства (getYRot -> yRot), часть только как методы
function calamityGet(obj, method) {
  let f = obj[method]
  if (typeof f === 'function') return f.call(obj)
  let base = method.replace(/^(get|is)/, '')
  let v = obj[base.charAt(0).toLowerCase() + base.slice(1)]
  if (v === undefined) v = obj[base]
  return typeof v === 'function' ? v.call(obj) : v
}

function markNbt(id, reach) {
  let half = MARK_WIDTH / 2
  let tags = '"' + MARK_TAG + '","' + MARK_TAG + '_' + id + '"' + (reach > 0 ? ',"' + MARK_TAG + '_reach_' + reach + '"' : '')
  return '{Tags:[' + tags + '],block_state:{Name:"minecraft:yellow_stained_glass"},' +
    'transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],' +
    'translation:[' + (-half) + 'f,0f,' + (-half) + 'f],scale:[' + MARK_WIDTH + 'f,' + MARK_HEIGHT + 'f,' + MARK_WIDTH + 'f]},' +
    'brightness:{sky:15,block:15},view_range:4f,width:1f,height:' + MARK_HEIGHT + 'f,' +
    'Glowing:1b,glow_color_override:' + MARK_GLOW + '}'
}

const CalamityMarks = {
  onReach: {},
  add(server, playerName, id, x, y, z, reach) {
    this.remove(server, id)
    server.runCommandSilent('execute as ' + playerName + ' at @s run summon minecraft:block_display ' +
      x + ' ' + y + ' ' + z + ' ' + markNbt(id, reach || 0))
  },
  remove(server, id) {
    server.runCommandSilent('kill @e[type=minecraft:block_display,tag=' + MARK_TAG + '_' + id + ']')
  }
}

// Подход к точке: раз в полсекунды ищем рядом с игроком точки с радиусом
PlayerEvents.tick(event => {
  let p = event.player
  if (p.tickCount % 10 != 0) return
  let level = calamityGet(p, 'level')
  let list = level.getEntities(p, calamityGet(p, 'getBoundingBox').inflate(16))
  for (let i = 0; i < list.size(); i++) {
    let e = list.get(i)
    let tags = calamityGet(e, 'getTags')
    if (!tags.contains(MARK_TAG)) continue
    let id = null, reach = 0
    tags.forEach(t => {
      t = String(t)
      if (t.indexOf(MARK_TAG + '_reach_') == 0) reach = Number(t.substring((MARK_TAG + '_reach_').length))
      else if (t.indexOf(MARK_TAG + '_') == 0) id = t.substring(MARK_TAG.length + 1)
    })
    if (!id || reach <= 0) continue
    let dx = calamityGet(e, 'getX') - calamityGet(p, 'getX'), dz = calamityGet(e, 'getZ') - calamityGet(p, 'getZ')
    if (dx * dx + dz * dz > reach * reach) continue
    let server = calamityGet(p, 'getServer')
    CalamityMarks.remove(server, id)
    let handler = CalamityMarks.onReach[id]
    if (handler) handler(server, p)
  }
})
