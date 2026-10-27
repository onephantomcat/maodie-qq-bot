"""Build a public Windows release from an explicit source allowlist."""
from pathlib import Path
import json, subprocess, tempfile, zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text('utf-8'))['version']
dest = root / 'dist'
dest.mkdir(exist_ok=True)
output = dest / f'maodie-windows-{version}.zip'
files = [root / p for p in ['index.mjs','package.json','package-lock.json','config.example.json',
    'persona.txt','setup.ps1','start-services.ps1','README.md','LICENSE','AGENTS.md','.gitignore']]
for folder in ['src','test','windows','tools']:
    files += [p for p in (root / folder).rglob('*') if p.is_file() and p.suffix != '.exe' and '__pycache__' not in p.parts]
files += [root / 'assets' / p for p in ['memes.json','slang.json']]
ws = root / 'node_modules' / 'ws'
if not (ws / 'LICENSE').is_file():
    raise SystemExit('Run npm ci first: ws and its license are required.')
files += [p for p in ws.rglob('*') if p.is_file()]
with tempfile.TemporaryDirectory(prefix='maodie-build-') as scratch:
    subprocess.run(['powershell.exe','-NoProfile','-ExecutionPolicy','Bypass','-File',str(root/'windows/build.ps1'),'-Destination',scratch],check=True)
    with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(Path(scratch)/'耄耋机器人.exe','耄耋机器人.exe')
        for file in files:
            archive.write(file,Path('app')/file.relative_to(root))
        archive.writestr('app/assets/stickers/manifest.json','[]\n')
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert not any('.local.' in n or n.endswith('config.local.json') for n in archive.namelist())
print(output)
