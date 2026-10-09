#!/usr/bin/env python3
"""Bring the packwiz manifests in mods/ in line with the mods folder of the live game.

The game (.minecraft/mods) is where mods are tried out; the repository keeps only manifests:
  * a jar Modrinth knows (exact file, by sha512) becomes mods/<slug>.pw.toml;
  * a jar CurseForge knows is left to `packwiz curseforge detect`;
  * anything else (our own and patched jars) is copied as a plain file.
A manifest or plain jar whose file is no longer in the game is removed. File names are kept as they are in the game.

usage: tools/sync_mods.py [--apply]     (without --apply it only prints the plan)
"""
import glob, hashlib, json, os, re, shutil, subprocess, sys, tomllib, urllib.parse, urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODS = os.path.join(REPO, 'mods')
GAME = os.environ.get('CALAMITY_GAME_MODS', '/mnt/c/Users/dzenthai/AppData/Roaming/.minecraft/mods')
PACKWIZ = os.environ.get('PACKWIZ', os.path.expanduser('~/go/bin/packwiz'))
UA = {'User-Agent': 'dzenthai/calamity-modpack (tools/sync_mods.py)', 'Content-Type': 'application/json'}
APPLY = '--apply' in sys.argv


def api(url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=UA, method='POST' if body is not None else 'GET')
    return json.load(urllib.request.urlopen(req, timeout=60))


def pack_entries():
    """filename -> (path of the manifest or plain jar, hash format, hash)"""
    out = {}
    for p in glob.glob(os.path.join(MODS, '*.pw.toml')):
        t = tomllib.load(open(p, 'rb'))
        out[t['filename']] = (p, t['download']['hash-format'], t['download']['hash'])
    for p in glob.glob(os.path.join(MODS, '*.jar')):
        out[os.path.basename(p)] = (p, 'sha1', hashlib.sha1(open(p, 'rb').read()).hexdigest())
    return out


def side(project):
    # Singleplayer runs the server inside the client, so server-only mods are still needed there.
    return 'client' if project['server_side'] == 'unsupported' else 'both'


def main():
    game = {f: open(os.path.join(GAME, f), 'rb').read() for f in os.listdir(GAME) if f.endswith('.jar')}
    pack = pack_entries()

    stale = [f for f, (p, alg, h) in pack.items() if f not in game or hashlib.new(alg, game[f]).hexdigest() != h]
    missing = [f for f in game if f not in pack or f in stale]
    print(f'game {len(game)} jars, pack {len(pack)} entries; remove {len(stale)}, add {len(missing)}')
    for f in sorted(stale):
        print('  - ', f)

    found = {}
    if missing:
        sha = {f: hashlib.sha512(game[f]).hexdigest() for f in missing}
        versions = api('https://api.modrinth.com/v2/version_files', {'hashes': list(sha.values()), 'algorithm': 'sha512'})
        ids = sorted({v['project_id'] for v in versions.values()})
        projects = {p['id']: p for p in api('https://api.modrinth.com/v2/projects?ids=' + urllib.parse.quote(json.dumps(ids)))} if ids else {}
        for f, h in sha.items():
            if h in versions:
                v = versions[h]
                file = next(x for x in v['files'] if x['hashes']['sha512'] == h)
                found[f] = (projects[v['project_id']], v, file, h)
    for f in sorted(missing):
        print('  + ', f, '(Modrinth)' if f in found else '(CurseForge or plain file)')
    if not APPLY:
        print('dry run; pass --apply to write')
        return

    for f in stale:
        os.remove(pack[f][0])
    for f, (p, v, file, h) in found.items():
        name = p['slug']
        if os.path.exists(os.path.join(MODS, name + '.pw.toml')):
            name += '-' + v['id'].lower()
        with open(os.path.join(MODS, name + '.pw.toml'), 'w', encoding='utf-8') as out:
            out.write(f'name = {json.dumps(p["title"], ensure_ascii=False)}\nfilename = {json.dumps(f, ensure_ascii=False)}\n'
                      f'side = "{side(p)}"\n\n[download]\nurl = {json.dumps(file["url"])}\nhash-format = "sha512"\nhash = "{h}"\n\n'
                      f'[update]\n[update.modrinth]\nmod-id = "{p["id"]}"\nversion = "{v["id"]}"\n')
    rest = [f for f in missing if f not in found]
    for f in rest:
        shutil.copyfile(os.path.join(GAME, f), os.path.join(MODS, f))
    if rest:
        # turns the jars CurseForge knows into manifests and deletes them; the others stay as plain files
        subprocess.run([PACKWIZ, 'curseforge', 'detect'], cwd=REPO, check=True)
        sha1 = {hashlib.sha1(game[f]).hexdigest(): f for f in rest}
        for p in glob.glob(os.path.join(MODS, '*.pw.toml')):
            t = tomllib.load(open(p, 'rb'))
            local = sha1.get(t['download']['hash']) if t['download']['hash-format'] == 'sha1' else None
            if local and local != t['filename']:
                text = open(p, encoding='utf-8').read()
                open(p, 'w', encoding='utf-8').write(re.sub(r'^filename = .*$', 'filename = ' + json.dumps(local, ensure_ascii=False), text, count=1, flags=re.M))
    subprocess.run([PACKWIZ, 'refresh'], cwd=REPO, check=True, stdout=subprocess.DEVNULL)
    after = pack_entries()
    ok = set(after) == set(game) and all(hashlib.new(a, game[f]).hexdigest() == h for f, (_, a, h) in after.items())
    print('in sync with the game:', ok)


if __name__ == '__main__':
    main()
