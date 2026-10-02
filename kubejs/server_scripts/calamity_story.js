// Calamity: сюжетные сцены пролога.
//  • первый вход: круг свечей, тело Кайрена (Easy NPC, подсвечено), катсцена «Agarwaen»
//  • клик по телу (/calamity_story body): монолог-катсцена -> квест засчитан, вещи выданы -> книга квестов
//  • /calamity_story aberfort: подсветка Аберфорта, когда он появляется после Наги
const INTRO_FLAG = 'calamity_intro_done'
const BODY_FLAG = 'calamity_body_searched'

function storyTeam(server) {
  server.runCommandSilent('team add calamity_story')
  server.runCommandSilent('team modify calamity_story color gold')
}

function runIntro(server, p) {
  let n = p.username
  p.persistentData.putBoolean(INTRO_FLAG, true)
  let run = c => server.runCommandSilent('execute as ' + n + ' at @s run ' + c)
  let ring = [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]]
  ring.forEach(o => run('execute positioned ~' + o[0] + ' ~ ~' + o[1] +
    ' if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ #minecraft:replaceable run setblock ~ ~ ~ minecraft:candle[candles=3,lit=true]'))
  run('easy_npc preset import_new data calamity:easy_npc/preset/humanoid_slim/kairen.npc.snbt ~3 ~ ~')
  storyTeam(server)
  run('tag @e[type=easy_npc:humanoid_slim,distance=..6,sort=nearest,limit=1,tag=!calamity_aberfort] add calamity_kairen')
  run('team join calamity_story @e[tag=calamity_kairen]')
  run('effect give @e[tag=calamity_kairen] minecraft:glowing infinite 0 true')
  run('data merge entity @e[tag=calamity_kairen,limit=1] {NoAI:1b}')
  server.scheduleInTicks(40, () => server.runCommandSilent('title ' + n + ' actionbar {"text":"Осмотри тело","color":"gold","italic":true}'))
  console.info('[calamity_story] intro for ' + n)
}

PlayerEvents.loggedIn(event => {
  let p = event.player
  if (p.persistentData.getBoolean(INTRO_FLAG)) return
  p.persistentData.putBoolean(INTRO_FLAG, true)
  let server = event.server
  server.scheduleInTicks(60, () => runIntro(server, p))
})

// Сброс пролога для проверки в том же мире: убирает тела/NPC рядом, флаги, прогресс первых квестов и запускает вступление заново
function resetPrologue(server, p) {
  let n = p.username
  server.runCommandSilent('kill @e[tag=calamity_kairen]')
  server.runCommandSilent('kill @e[type=easy_npc:humanoid,tag=calamity_aberfort]')
  server.runCommandSilent('execute as ' + n + ' at @s run kill @e[type=#calamity:story_npcs,distance=..48]')
  p.persistentData.putBoolean(INTRO_FLAG, false)
  p.persistentData.putBoolean(BODY_FLAG, false)
  server.runCommandSilent('advancement revoke ' + n + ' only calamity:quest/searched_body')
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
  server.runCommandSilent('effect clear @e[tag=calamity_kairen] minecraft:glowing')
  server.runCommandSilent('execute at @e[tag=calamity_kairen,limit=1,sort=nearest] run cutscene start ' + n + ' calamity:monologue ~ ~ ~ 0 0 0 0 0 0')
  server.runCommandSilent('advancement grant ' + n + ' only calamity:quest/searched_body')
  server.scheduleInTicks(410, () => server.runCommandSilent('execute as ' + n + ' run ftbquests open_book 6A66C96152134B69'))
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
