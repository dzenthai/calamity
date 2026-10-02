// Calamity climate: status effects for the Valheim-style temperature system (logic in server_scripts).
// The effects only carry the icon and the name; the attribute penalties are managed by the server script.
StartupEvents.registry('mob_effect', event => {
  event.create('calamity:wet').color(0x3f76e4).harmful()
  event.create('calamity:cold').color(0x9fd7ff).harmful()
  event.create('calamity:freezing').color(0xe8f6ff).harmful()
  event.create('calamity:hot').color(0xff8a1e).harmful()
  event.create('calamity:warmed').color(0xffb347).beneficial()
  event.create('calamity:resting').color(0xffd27f).beneficial()
  event.create('calamity:rested').color(0xffe066).beneficial()
})
