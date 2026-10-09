// Calamity: сюжетные сцены пролога.
//  • первый вход: в 10–20 блоках позади игрока (вне поля зрения) круг свечей, тело Кайрена (Easy NPC, подсвечено) и столб света (calamity_marks.js)
//    рядом с телом на земле лежит письмо Кайрена (книга Supplementaries, текст — loot table calamity:kairen_letter)
//  • клик по телу (/calamity_story body): монолог-катсцена; подобрать письмо — вторая цель квеста.
//    В руке у тела посох (loot table calamity:kairen_staff), после катсцены он переходит игроку.
//    Когда тело осмотрено и письмо поднято: квест засчитан -> книга квестов
//  • /calamity_story aberfort: подсветка Аберфорта, когда он появляется после Наги
const INTRO_FLAG = 'calamity_intro_done'
const BODY_FLAG = 'calamity_body_searched'
const BODY_SCENE_FLAG = 'calamity_body_scene_done'   // катсцена у тела досмотрена
const LETTER_FLAG = 'calamity_letter_taken'
const LETTER_POS = 'calamity_letter_pos'
const GUIDE_QUEST = '6A66C96152134B69'
const $StoryDataComponents = Java.loadClass('net.minecraft.core.component.DataComponents')

function storyTeam(server) {
  server.runCommandSilent('team add calamity_story')
  server.runCommandSilent('team modify calamity_story color gold')
}

const $StoryBlockPos = Java.loadClass('net.minecraft.core.BlockPos')
const $StoryHeightmap = Java.loadClass('net.minecraft.world.level.levelgen.Heightmap')
const $StoryBlockTags = Java.loadClass('net.minecraft.tags.BlockTags')

// Верх столбца (x, z) по MOTION_BLOCKING: учитывает листву и воду, поэтому под деревом или в воде
// верхом окажется лист/вода, и такое место отбросится. null — если стоять там нельзя.
function surfaceY(level, x, z) {
  let pos = new $StoryBlockPos(x, 0, z)
  if (!level.isLoaded(pos)) return null
  let y = Number(level.getHeight($StoryHeightmap.Types.MOTION_BLOCKING, x, z))
  let ground = level.getBlockState(new $StoryBlockPos(x, y - 1, z))
  if (!calamityGet(calamityGet(ground, 'getFluidState'), 'isEmpty')) return null   // вода, лава
  if (!calamityGet(ground, 'isSolid') || ground['is(net.minecraft.tags.TagKey)']($StoryBlockTags.LEAVES)) return null
  return y
}

// Тело лежит на ровной открытой земле: 3×3 вокруг на одной высоте, над ним небо
function bodySpotOk(level, x, z, py) {
  let y = surfaceY(level, x, z)
  if (y == null || Math.abs(y - py) > 6) return null
  if (!level.canSeeSky(new $StoryBlockPos(x, y, z))) return null
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++)
    if (surfaceY(level, x + dx, z + dz) !== y) return null
  return y
}

// Место для тела: 10–20 блоков от игрока, вне поля зрения (сзади и по бокам), чтобы не видеть, как оно появляется.
// Если сзади только вода и скалы — ищем в любую сторону и дальше; в крайнем случае — у самого игрока.
function findBodySpot(p) {
  let level = calamityGet(p, 'level')
  let px = Math.floor(calamityGet(p, 'getX')), py = Math.floor(calamityGet(p, 'getY')), pz = Math.floor(calamityGet(p, 'getZ'))
  let yaw = Number(calamityGet(p, 'getYRot')) || 0
  let passes = [
    { turns: [180, 160, -160, 140, -140, 120, -120, 105, -105], dists: [14, 16, 12, 18, 20, 10] },
    { turns: [90, -90, 60, -60, 30, -30, 0], dists: [14, 16, 12, 18, 20, 10] },
    { turns: [180, 135, -135, 90, -90, 45, -45, 0], dists: [24, 28, 32] },
    { turns: [0, 45, 90, 135, 180, -135, -90, -45], dists: [4, 5, 6] }
  ]
  for (let i = 0; i < passes.length; i++) {
    let pass = passes[i]
    for (let t = 0; t < pass.turns.length; t++) for (let d = 0; d < pass.dists.length; d++) {
      let a = (yaw + pass.turns[t]) * Math.PI / 180
      let x = Math.floor(px - Math.sin(a) * pass.dists[d])
      let z = Math.floor(pz + Math.cos(a) * pass.dists[d])
      let y = bodySpotOk(level, x, z, py)
      if (y != null) return { x: x, y: y, z: z }
    }
  }
  let y = surfaceY(level, px + 3, pz)
  return { x: px + 3, y: y == null ? py : y, z: pz }   // совсем некуда: рядом с игроком, но на поверхности
}

function runIntro(server, p) {
  let n = p.username
  p.persistentData.putBoolean(INTRO_FLAG, true)
  let s = findBodySpot(p)
  let run = c => server.runCommandSilent('execute as ' + n + ' at @s positioned ' + (s.x + 0.5) + ' ' + s.y + ' ' + (s.z + 0.5) + ' run ' + c)
  // круг свечей вокруг тела; радиус 3, чтобы свечи не торчали из лежащего тела
  let ring = [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2], [2, -2], [-2, 2]]
  ring.forEach(o => run('execute positioned ~' + o[0] + ' ~ ~' + o[1] +
    ' if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ #minecraft:replaceable run setblock ~ ~ ~ minecraft:candle[candles=3,lit=true]'))
  run('easy_npc preset import_new data calamity:easy_npc/preset/humanoid_slim/kairen.npc.snbt ~ ~ ~')
  storyTeam(server)
  run('tag @e[type=easy_npc:humanoid_slim,distance=..2,sort=nearest,limit=1,tag=!calamity_aberfort] add calamity_kairen')
  run('team join calamity_story @e[tag=calamity_kairen]')
  run('effect give @e[tag=calamity_kairen] minecraft:glowing infinite 0 true')
  // взгляд на юг (+Z): тогда правая рука тела — со стороны -X, и письмо кладём туда (placeLetter)
  run('data merge entity @e[tag=calamity_kairen,limit=1] {NoAI:1b,Rotation:[0f,0f]}')
  // посох в правой руке; после катсцены он перейдёт к игроку (onBody)
  run('loot replace entity @e[tag=calamity_kairen,limit=1] weapon.mainhand loot calamity:kairen_staff')
  CalamityMarks.add(server, n, 'kairen', s.x + 0.5, s.y, s.z + 0.5, 0, 'Тело')
  placeLetter(server, p, s)
  server.scheduleInTicks(40, () => server.runCommandSilent('title ' + n + ' actionbar {"text":"Осмотри тело","color":"gold","italic":true}'))
  console.info('[calamity_story] intro for ' + n + ' at ' + s.x + ' ' + s.y + ' ' + s.z)
}

// Письмо лежит на земле у тела: горизонтальная стопка книг Supplementaries, в неё кладём письмо из loot table.
// Площадка 3×3 вокруг тела ровная (bodySpotOk), так что клетка по диагонали — на той же высоте.
// Тело смотрит на юг: ноги к +Z, голова к -Z. (+1, 0) — у левой руки Кайрена, на блок выше ног (проверено в игре).
function placeLetter(server, p, s) {
  let n = p.username
  let x = s.x + 1, y = s.y, z = s.z
  let at = 'execute as ' + n + ' at @s run '
  server.runCommandSilent(at + 'setblock ' + x + ' ' + y + ' ' + z + ' supplementaries:book_pile_horizontal')
  server.runCommandSilent(at + 'loot replace block ' + x + ' ' + y + ' ' + z + ' container.0 loot calamity:kairen_letter')
  p.persistentData.putString(LETTER_POS, x + ' ' + y + ' ' + z)
}

function isKairenLetter(item) {
  if (String(item.id) != 'minecraft:written_book') return false
  let cd = item.get($StoryDataComponents.CUSTOM_DATA)
  return cd != null && String(cd.copyTag().getString('calamity_letter')) == 'kairen'
}

// Стопка Supplementaries сама письмо не отдаёт (ломается в никуда, читать с земли нельзя),
// поэтому клик или удар по ней — это «поднять письмо»: блок исчезает, письмо в руке и сразу открыто.
const $StoryHand = Java.loadClass('net.minecraft.world.InteractionHand')

function isLetterBlock(p, block) {
  if (String(block.id) != 'supplementaries:book_pile_horizontal') return false
  return String(p.persistentData.getString(LETTER_POS)) == block.x + ' ' + block.y + ' ' + block.z
}

function hasLetter(p) {
  let inv = calamityGet(p, 'getInventory')
  for (let i = 0; i < inv.getContainerSize(); i++) if (isKairenLetter(inv.getItem(i))) return true
  return false
}

function pickUpLetter(server, p) {
  let n = p.username
  let inHand = calamityGet(p, 'getMainHandItem').isEmpty()
  // сначала письмо игроку; книгу с земли убираем, только если оно действительно выдано
  server.runCommandSilent(inHand
    ? 'loot replace entity ' + n + ' weapon.mainhand loot calamity:kairen_letter'
    : 'loot give ' + n + ' loot calamity:kairen_letter')
  if (!hasLetter(p)) {
    console.error('[calamity_story] letter loot failed for ' + n + ' (loot table calamity:kairen_letter не загрузилась?)')
    return
  }
  server.runCommandSilent('execute as ' + n + ' at @s run setblock ' + String(p.persistentData.getString(LETTER_POS)) + ' minecraft:air')
  p.persistentData.putString(LETTER_POS, '')
  if (inHand) p.openItemGui(calamityGet(p, 'getMainHandItem'), $StoryHand.MAIN_HAND)
  else server.runCommandSilent('title ' + n + ' actionbar {"text":"Письмо Кайрена теперь у тебя","color":"gold","italic":true}')
}

BlockEvents.rightClicked(event => {
  let p = event.player
  if (!p || String(event.hand) != 'MAIN_HAND' || !isLetterBlock(p, event.block)) return
  pickUpLetter(calamityGet(p, 'getServer'), p)
  event.cancel()
})

BlockEvents.broken(event => {
  let p = event.player
  if (!p || !isLetterBlock(p, event.block)) return
  pickUpLetter(calamityGet(p, 'getServer'), p)
  event.cancel()
})

function openGuide(server, n) {
  server.runCommandSilent('execute as ' + n + ' run ftbquests open_book ' + GUIDE_QUEST)
}

// Письмо подобрано (из стопки на земле или как угодно ещё)
PlayerEvents.inventoryChanged(event => {
  let p = event.player
  if (p.persistentData.getBoolean(LETTER_FLAG) || !isKairenLetter(event.item)) return
  p.persistentData.putBoolean(LETTER_FLAG, true)
  let server = calamityGet(p, 'getServer')
  console.info('[calamity_story] letter taken by ' + p.username)
  server.runCommandSilent('advancement grant ' + p.username + ' only calamity:quest/letter_taken')
  // тело уже осмотрено и катсцена позади — квест закрыт, ведём в книгу заданий
  if (p.persistentData.getBoolean(BODY_SCENE_FLAG)) server.scheduleInTicks(30, () => openGuide(server, p.username))
})

PlayerEvents.loggedIn(event => {
  let p = event.player
  // вышел посреди катсцены — тег Better Combat не успел сняться
  event.server.runCommandSilent('tag ' + p.username + ' remove bettercombat_disabled')
  if (p.persistentData.getBoolean(INTRO_FLAG)) return
  p.persistentData.putBoolean(INTRO_FLAG, true)
  let server = event.server
  server.scheduleInTicks(60, () => runIntro(server, p))
})

// Сброс пролога для проверки в том же мире: убирает тела/NPC рядом, флаги, прогресс первых квестов и запускает вступление заново
function resetPrologue(server, p) {
  let n = p.username
  server.runCommandSilent('execute at @e[tag=calamity_kairen] run fill ~-3 ~ ~-3 ~3 ~ ~3 minecraft:air replace minecraft:candle')
  CalamityMarks.remove(server, 'kairen')
  server.runCommandSilent('kill @e[tag=calamity_kairen]')
  server.runCommandSilent('kill @e[type=easy_npc:humanoid,tag=calamity_aberfort]')
  server.runCommandSilent('execute as ' + n + ' at @s run kill @e[type=#calamity:story_npcs,distance=..48]')
  // письмо: стопка на земле (setblock чистит контейнер, так что письмо не выпадет) и экземпляр в инвентаре; посох тоже
  let lp = String(p.persistentData.getString(LETTER_POS))
  if (lp) server.runCommandSilent('execute as ' + n + ' at @s if block ' + lp + ' supplementaries:book_pile_horizontal run setblock ' + lp + ' minecraft:air')
  server.runCommandSilent('clear ' + n + ' minecraft:written_book[minecraft:custom_data={calamity_letter:"kairen"}]')
  server.runCommandSilent('clear ' + n + ' born_in_chaos_v1:dark_rod[minecraft:custom_data={calamity_item:"kairen_staff"}]')
  p.persistentData.putBoolean(INTRO_FLAG, false)
  p.persistentData.putBoolean(BODY_FLAG, false)
  p.persistentData.putBoolean(BODY_SCENE_FLAG, false)
  p.persistentData.putBoolean(LETTER_FLAG, false)
  p.persistentData.putString(LETTER_POS, '')
  server.runCommandSilent('advancement revoke ' + n + ' only calamity:quest/searched_body')
  server.runCommandSilent('advancement revoke ' + n + ' only calamity:quest/letter_taken')
  server.runCommandSilent('advancement revoke ' + n + ' only calamity:quest/met_aberfort')
  server.runCommandSilent('ftbquests change_progress ' + n + ' reset 4552D4758B57E02A')
  console.info('[calamity_story] prologue reset for ' + n)
  server.scheduleInTicks(20, () => runIntro(server, p))
}

function onBody(server, p) {
  let n = p.username
  if (p.persistentData.getBoolean(BODY_FLAG)) {
    server.runCommandSilent('title ' + n + ' actionbar {"text":"Кайрен молчит. Ему больше нечего тебе сказать.","color":"gray","italic":true}')
    return
  }
  p.persistentData.putBoolean(BODY_FLAG, true)
  console.info('[calamity_story] body searched by ' + n)
  CalamityMarks.remove(server, 'kairen')   // столб света не должен попасть в катсцену
  server.runCommandSilent('effect clear @e[tag=calamity_kairen] minecraft:glowing')
  startCutscene(server, n, 'calamity:monologue', 310, 'execute at @e[tag=calamity_kairen,limit=1,sort=nearest] run ')
  server.runCommandSilent('advancement grant ' + n + ' only calamity:quest/searched_body')
  server.scheduleInTicks(310, () => {
    p.persistentData.putBoolean(BODY_SCENE_FLAG, true)
    // посох из руки Кайрена — игроку (в катсцене он ещё был виден у тела)
    server.runCommandSilent('item replace entity @e[tag=calamity_kairen] weapon.mainhand with minecraft:air')
    server.runCommandSilent('loot give ' + n + ' loot calamity:kairen_staff')
    // письмо уже у игрока — квест закрыт, ведём в книгу; иначе подсказываем поднять его
    if (p.persistentData.getBoolean(LETTER_FLAG)) openGuide(server, n)
    else server.runCommandSilent('title ' + n + ' actionbar {"text":"Подними письмо","color":"gold","italic":true}')
  })
}

// Катсцена с выключенным Better Combat. В катсцене прицел считается от камеры, игрок стоит в кадре,
// и удар Better Combat попадает по самому игроку — сервер за это кикает («Attempting to attack an invalid entity»).
// disable_actions в JSON катсцены перекрывает только ванильную атаку, поэтому на время катсцены вешаем тег Better Combat.
// ticks — длина катсцены вместе с затемнением в конце; prefix — откуда её запускать (execute at ...).
const BC_DISABLED = 'bettercombat_disabled'
function startCutscene(server, n, id, ticks, prefix) {
  server.runCommandSilent('tag ' + n + ' add ' + BC_DISABLED)
  server.runCommandSilent(prefix + 'cutscene start ' + n + ' ' + id + ' ~ ~ ~ 0 0 0 0 0 0')
  server.scheduleInTicks(ticks, () => server.runCommandSilent('tag ' + n + ' remove ' + BC_DISABLED))
}

ServerEvents.commandRegistry(event => {
  const { commands: Commands, arguments: Arguments } = event
  event.register(Commands.literal('calamity_story')
    .requires(src => src.hasPermission(2))
    .then(Commands.literal('body').then(Commands.argument('player', Arguments.PLAYER.create(event)).executes(ctx => {
      onBody(ctx.source.server, Arguments.PLAYER.getResult(ctx, 'player'))
      return 1
    })))
    .then(Commands.literal('reset').then(Commands.argument('player', Arguments.PLAYER.create(event)).executes(ctx => {
      resetPrologue(ctx.source.server, Arguments.PLAYER.getResult(ctx, 'player'))
      return 1
    })))
    .then(Commands.literal('aberfort').then(Commands.argument('player', Arguments.PLAYER.create(event)).executes(ctx => {
      let server = ctx.source.server
      let n = Arguments.PLAYER.getResult(ctx, 'player').username
      storyTeam(server)
      let run = c => server.runCommandSilent('execute as ' + n + ' at @s run ' + c)
      run('tag @e[type=easy_npc:humanoid,distance=..8,sort=nearest,limit=1,tag=!calamity_kairen] add calamity_aberfort')
      run('team join calamity_story @e[tag=calamity_aberfort]')
      run('effect give @e[tag=calamity_aberfort] minecraft:glowing infinite 0 true')
      return 1
    }))))
})
