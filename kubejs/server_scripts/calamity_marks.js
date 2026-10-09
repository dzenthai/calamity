// Calamity: контрольные точки. Видимая часть — метка Server Waypoint, которая уходит в Xaero (миникарта, карта мира,
// значок с расстоянием в мире). Точка подхода — невидимая сущность minecraft:marker с тегами.
// Старый столб золотого света (block_display) оставлен выключенным: MARK_PILLAR = true вернёт его.
// Все server_scripts выполняются в одной области видимости, поэтому CalamityMarks доступен из других файлов:
//   CalamityMarks.add(server, playerName, id, x, y, z, reach, label)  ставит точку в измерении игрока
//   CalamityMarks.remove(server, id)                                 убирает точку
//   CalamityMarks.onReach[id] = (server, player) => {...}            вызывается, когда игрок подошёл ближе reach блоков
// Точка без reach (0) только показывает место; её убирает сам сюжет (как у тела Кайрена).
// Метки лежат в своём наборе Xaero «Calamity» (Server Waypoint при каждом входе пересоздаёт набор целиком, поэтому
// в основной набор их класть нельзя — сотрутся личные метки игрока). Видно их, потому что в конфиге Xaero включено
// waypoints_all_sets = true. label — подпись метки, у разных точек должна различаться.
// Ограничение: точки видны всем игрокам на сервере, а не только тому, для кого поставлены.

const MARK_TAG = 'calamity_mark'
const MARK_PILLAR = false
const MARK_HEIGHT = 64
const MARK_WIDTH = 0.4
const MARK_GLOW = 0xF2C55C   // золото, как текст катсцен
const MARK_WP_LIST = 'Calamity'
const MARK_WP_COLOR = 'F2C55C'
const MARK_WP_KEY = 'calamity_mark_wp_'   // persistentData: id -> "измерение|подпись", чтобы снять метку после перезахода

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
  if (!MARK_PILLAR) return '{Tags:[' + tags + ']}'
  return '{Tags:[' + tags + '],block_state:{Name:"minecraft:yellow_stained_glass"},' +
    'transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],' +
    'translation:[' + (-half) + 'f,0f,' + (-half) + 'f],scale:[' + MARK_WIDTH + 'f,' + MARK_HEIGHT + 'f,' + MARK_WIDTH + 'f]},' +
    'brightness:{sky:15,block:15},view_range:4f,width:1f,height:' + MARK_HEIGHT + 'f,' +
    'Glowing:1b,glow_color_override:' + MARK_GLOW + '}'
}

// Измерение игрока строкой "minecraft:overworld" (level.dimension бывает и ResourceKey, и ResourceLocation)
function calamityDimension(player) {
  let level = calamityGet(player, 'level')
  let d = level.dimension
  if (typeof d === 'function') d = d.call(level)
  let m = String(d).match(/([a-z0-9_.-]+:[a-z0-9_.\/-]+)\]?$/)
  return m ? m[1] : 'minecraft:overworld'
}

const CalamityMarks = {
  onReach: {},
  add(server, playerName, id, x, y, z, reach, label) {
    this.remove(server, id)
    server.runCommandSilent('execute as ' + playerName + ' at @s run summon ' + (MARK_PILLAR ? 'minecraft:block_display ' : 'minecraft:marker ') +
      x + ' ' + y + ' ' + z + ' ' + markNbt(id, reach || 0))
    let player = calamityGet(server, 'getPlayerList').getPlayerByName(playerName)
    if (!player) return
    let dim = calamityDimension(player)
    let name = String(label || 'Цель').replace(/"/g, '')
    server.runCommandSilent('wp add ' + dim + ' ' + MARK_WP_LIST + ' ' + Math.floor(x) + ' ' + Math.floor(y) + ' ' + Math.floor(z) +
      ' "' + name + '" "!" ' + MARK_WP_COLOR + ' 0 false')
    server.persistentData.putString(MARK_WP_KEY + id, dim + '|' + name)
  },
  remove(server, id) {
    server.runCommandSilent('kill @e[tag=' + MARK_TAG + '_' + id + ']')
    let key = MARK_WP_KEY + id
    if (!server.persistentData.contains(key)) return
    let saved = String(server.persistentData.getString(key))
    let sep = saved.indexOf('|')
    server.runCommandSilent('wp remove ' + saved.substring(0, sep) + ' ' + MARK_WP_LIST + ' "' + saved.substring(sep + 1) + '"')
    server.persistentData.remove(key)
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
