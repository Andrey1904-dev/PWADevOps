import sys,json,urllib.request
from pathlib import Path
# Read credential from stdin only; never echo or write it to disk.
if sys.stdin.isatty():
 import termios
 attrs=termios.tcgetattr(sys.stdin.fileno());attrs[3] &= ~termios.ECHO;termios.tcsetattr(sys.stdin.fileno(),termios.TCSANOW,attrs)
token=json.loads(sys.stdin.readline())['token']
key=Path('.secrets/bootstrap').read_text()
request=urllib.request.Request('https://okswmvxxoataxprjwzjv.supabase.co/functions/v1/telegram-provision',data=json.dumps({'token':token}).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'},method='POST')
try:
 with urllib.request.urlopen(request,timeout=60) as response:
  result=json.load(response)
 print(json.dumps(result,ensure_ascii=False))
except Exception:
 print('Provisioning request failed; no credentials logged')
 sys.exit(1)
