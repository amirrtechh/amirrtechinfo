const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const readStore = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const state = { hosts: readStore('shellbay-hosts', []), activity: readStore('shellbay-activity', []), prefs: { theme: 'system', accent: 'green', fontSize: 14, scrollback: 5000, cursorBlink: true, reduceMotion: false, focusTerminal: true, keepHistory: true, connectTimeout: 15, keepalive: 30, verboseSSH: false, ...readStore('shellbay-prefs', {}) }, socket: null, connected: false, activeCategory: 'All', terminalReady: false, sshDebugBuffer: '', passwordPromptAllowed: false, passwordPromptOpen: false, passwordPromptBlocked: false, authPromptBuffer: '' };
const accentColors = { green: '#78a56a', blue: '#6b9fe5', rose: '#d17c95', amber: '#d3a24c' };
const terminal = new window.Terminal({ cursorBlink: state.prefs.cursorBlink, cursorStyle: 'bar', macOptionIsMeta: true, rightClickSelectsWord: true, fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: state.prefs.fontSize, scrollback: state.prefs.scrollback, convertEol: false, theme: { background: '#17181e', foreground: '#d0d0d4', cursor: '#a5db9e', selectionBackground: '#78a56a55' } });
const fitAddon = new window.FitAddon.FitAddon();
const searchAddon = new window.SearchAddon.SearchAddon();
terminal.loadAddon(fitAddon); terminal.loadAddon(searchAddon); terminal.open($('#terminal-output'));
const categories = {
  'System': ['OS release|cat /etc/os-release','Kernel version|uname -a','Hostname|hostnamectl','System uptime|uptime','Boot time|who -b','Current date|date -Is','Timezone|timedatectl','System load|cat /proc/loadavg','CPU details|lscpu','Memory summary|free -h','Logged in users|who -a','Last logins|last -n 10','Failed logins|lastb -n 10','System messages|journalctl -n 30 --no-pager','Recent kernel messages|dmesg -T | tail -30','Process count|ps -e --no-headers | wc -l','Environment names|printenv | cut -d= -f1','Shell version|bash --version | head -1','Architecture|uname -m','Virtualization|systemd-detect-virt'],
  'Network': ['Interfaces|ip -brief address','Routes|ip route show','Listening sockets|ss -lntup','Active connections|ss -tunap','DNS resolver|cat /etc/resolv.conf','DNS lookup|dig example.com','Ping gateway|ip route | awk \'/default/ {print $3}\' | xargs -r ping -c 3','Firewall status|sudo ufw status verbose','Firewall rules|sudo iptables -S','ARP table|ip neigh show','Hosts file|cat /etc/hosts','Network stats|ip -s link','Public IP check|curl -s --max-time 3 https://api.ipify.org','TLS certificate|echo | openssl s_client -connect example.com:443 -servername example.com 2>/dev/null | openssl x509 -noout -subject -dates','Port test|ss -lnt','SSH daemon config|sshd -T | head -30','Network manager|systemctl status NetworkManager --no-pager','Listening TCP ports|ss -lnt','Listening UDP ports|ss -lnu','TCP statistics|nstat -az'],
  'Security': ['SSH config|sshd -T','SSH authorized keys|wc -l ~/.ssh/authorized_keys','SSH key fingerprints|ssh-keygen -lf ~/.ssh/authorized_keys','Recent auth events|sudo journalctl -u ssh -n 50 --no-pager','Login failures|sudo grep -i \'failed\' /var/log/auth.log | tail -25','Sudo access|sudo -l','Users with UID 0|awk -F: \'$3 == 0 {print $1}\' /etc/passwd','Password policy|sudo chage -l $USER','World-writable paths|find /tmp /var/tmp -maxdepth 2 -type f -perm -0002 -ls 2>/dev/null','SUID binaries|find /usr/bin /usr/sbin -type f -perm -4000 -ls 2>/dev/null','Capabilities|getcap -r /usr/bin /usr/sbin 2>/dev/null','Open security updates|apt list --upgradable 2>/dev/null | head -30','AppArmor status|sudo aa-status','SELinux status|getenforce','Listening root processes|sudo ss -lntup','SSH known hosts|wc -l ~/.ssh/known_hosts','Umask|umask -S','Login history|last -n 20','Audit service|systemctl status auditd --no-pager','File integrity tools|command -v aide osquery lynis'],
  'Processes': ['Top processes|ps aux --sort=-%cpu | head -15','Memory-heavy processes|ps aux --sort=-%mem | head -15','Process tree|pstree -ap | head -80','Process owners|ps -eo user= | sort | uniq -c | sort -rn | head','Zombie processes|ps -eo stat,pid,ppid,cmd | awk \'$1 ~ /Z/\'','My processes|ps -u "$USER" -f','Open files count|lsof -n 2>/dev/null | wc -l','System threads|ps -eLf | wc -l','Top CPU snapshot|top -b -n1 | head -20','Memory map sample|pmap -x 1 | tail -5','Process limits|ulimit -a','Current PID limits|cat /proc/sys/kernel/pid_max','Process states|ps -eo state= | sort | uniq -c','Orphan processes|ps -eo ppid,pid,cmd | awk \'$1 == 1\' | head -20','Running commands|ps -eo comm= | sort -u | head -40'],
  'Storage': ['Disk space|df -hT','Inode usage|df -ih','Block devices|lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINTS','Mount points|findmnt','Largest root directories|sudo du -xhd1 / 2>/dev/null | sort -h | tail -12','Largest home files|du -ah ~ 2>/dev/null | sort -h | tail -12','Disk I/O stats|iostat -xz 1 2','Swap usage|swapon --show','Temporary files|df -h /tmp','Filesystem types|lsblk -f','Disk SMART summary|sudo smartctl -H /dev/sda 2>/dev/null','Mount options|findmnt -o TARGET,OPTIONS','Recent disk messages|dmesg -T | grep -iE \'disk|nvme|I/O error\' | tail -20','Open deleted files|sudo lsof +L1 2>/dev/null | head -20','Home directory size|du -sh ~'],
  'Services': ['Failed services|systemctl --failed','Running services|systemctl list-units --type=service --state=running','Enabled services|systemctl list-unit-files --type=service --state=enabled','Boot duration|systemd-analyze','Slow boot services|systemd-analyze blame | head -15','SSH service|systemctl status ssh --no-pager','Cron jobs|crontab -l; sudo ls /etc/cron.d','Timers|systemctl list-timers --all','Recent service errors|journalctl -p err -n 40 --no-pager','Service list|systemctl list-units --type=service --no-pager','Systemd version|systemctl --version | head -1','Target state|systemctl get-default','Recent boot log|journalctl -b -n 40 --no-pager','Service resource use|systemd-cgtop -n1 --no-pager','Scheduled tasks|atq; systemctl list-timers --no-pager'],
  'Users': ['User accounts|cut -d: -f1 /etc/passwd','Human users|awk -F: \'$3 >= 1000 && $3 < 65534 {print $1, $3}\' /etc/passwd','Groups|cut -d: -f1 /etc/group','Current identity|id','Current groups|groups','Sudo group|getent group sudo wheel','Recent sessions|who -u','Login history|last -n 15','Password aging|chage -l "$USER"','Home permissions|stat -c \'%A %U:%G %n\' ~ ~/.ssh 2>/dev/null','SSH key files|find ~/.ssh -maxdepth 1 -type f -printf \'%m %f\\n\' 2>/dev/null','Account lock status|passwd -S "$USER"','User limits|ulimit -a','Logged-in count|who | wc -l','System accounts|awk -F: \'$3 < 1000 {print $1}\' /etc/passwd | head -40'],
  'Packages': ['APT package count|dpkg-query -f \'${binary:Package}\\n\' -W | wc -l','Recent packages|grep \' install \' /var/log/dpkg.log | tail -20','Upgradable packages|apt list --upgradable 2>/dev/null','Package hold list|apt-mark showhold','Package sources|grep -Rh ^deb /etc/apt/sources.list /etc/apt/sources.list.d 2>/dev/null','Kernel packages|dpkg -l \'linux-image*\' | tail -10','Installed security tools|dpkg -l | grep -Ei \'openssh|ufw|fail2ban|auditd|apparmor\'','Package integrity|sudo dpkg --verify | head -30','APT history|tail -40 /var/log/apt/history.log','Snap packages|snap list 2>/dev/null','Python packages|python3 -m pip list --user 2>/dev/null | head -30','Node version|node --version 2>/dev/null','Git version|git --version','Available disk packages|apt-cache stats | head -10','Package manager lock|fuser /var/lib/dpkg/lock-frontend 2>/dev/null'],
  'Containers': ['Docker version|docker version --format \'{{.Client.Version}} / {{.Server.Version}}\' 2>/dev/null','Docker containers|docker ps -a 2>/dev/null','Docker images|docker images 2>/dev/null','Docker networks|docker network ls 2>/dev/null','Docker volumes|docker volume ls 2>/dev/null','Docker daemon|systemctl status docker --no-pager','Container runtime|command -v docker podman containerd','Podman containers|podman ps -a 2>/dev/null','Kubernetes context|kubectl config current-context 2>/dev/null','Kubernetes nodes|kubectl get nodes 2>/dev/null','Kubernetes pods|kubectl get pods -A 2>/dev/null','Docker disk use|docker system df 2>/dev/null','Container processes|docker top $(docker ps -q | head -1) 2>/dev/null','Compose projects|docker compose ls 2>/dev/null','Cgroups version|stat -fc %T /sys/fs/cgroup'],
  'Logs': ['Auth log tail|sudo tail -n 50 /var/log/auth.log 2>/dev/null','Syslog tail|sudo tail -n 50 /var/log/syslog 2>/dev/null','Journal size|journalctl --disk-usage','Errors this boot|journalctl -b -p err --no-pager -n 50','Warnings this boot|journalctl -b -p warning --no-pager -n 30','SSH log tail|sudo journalctl -u ssh --no-pager -n 40','Kernel errors|dmesg -T --level=err,crit,alert,emerg | tail -30','Log files|sudo find /var/log -maxdepth 2 -type f -printf \'%s %p\\n\' | sort -nr | head -20','Recent logins|last -n 20','Failed SSH logins|sudo journalctl -u ssh --since today | grep -i failed | tail -30','Boot log count|journalctl -b --no-pager | wc -l','Rotated auth logs|ls -lh /var/log/auth.log* 2>/dev/null','Audit log tail|sudo tail -n 30 /var/log/audit/audit.log 2>/dev/null','Kernel ring buffer|dmesg -T | tail -30','System journal priority|journalctl -p alert..err -n 25 --no-pager']
};
const tools = Object.entries(categories).flatMap(([category, values]) => values.map(value => { const [name, command] = value.split('|'); return { category, name, command }; }));

function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function savePrefs() { save('shellbay-prefs', state.prefs); applyPrefs(); }
function applyPrefs() {
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.body.dataset.theme = state.prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : state.prefs.theme;
  document.documentElement.style.setProperty('--accent', accentColors[state.prefs.accent] || accentColors.green);
  document.body.classList.toggle('reduce-motion', state.prefs.reduceMotion);
  terminal.options.fontSize = Number(state.prefs.fontSize);
  terminal.options.scrollback = Number(state.prefs.scrollback);
  terminal.options.cursorBlink = Boolean(state.prefs.cursorBlink);
  terminal.options.theme = document.body.dataset.theme === 'dark'
    ? { background: '#13161b', foreground: '#e1e5ea', cursor: accentColors[state.prefs.accent], selectionBackground: `${accentColors[state.prefs.accent]}66` }
    : { background: '#17181e', foreground: '#d0d0d4', cursor: accentColors[state.prefs.accent], selectionBackground: `${accentColors[state.prefs.accent]}55` };
  $$('[data-theme-choice]').forEach(button => button.classList.toggle('selected', button.dataset.themeChoice === state.prefs.theme));
  $$('[data-accent-choice]').forEach(button => button.classList.toggle('selected', button.dataset.accentChoice === state.prefs.accent));
  $('#font-size-setting').value = state.prefs.fontSize; $('#font-size-value').textContent = state.prefs.fontSize;
  $('#scrollback-setting').value = state.prefs.scrollback; $('#scrollback-value').textContent = state.prefs.scrollback;
  $('#timeout-setting').value = state.prefs.connectTimeout; $('#timeout-value').textContent = state.prefs.connectTimeout;
  $('#keepalive-setting').value = state.prefs.keepalive; $('#keepalive-value').textContent = state.prefs.keepalive;
  $('#cursor-blink-setting').checked = state.prefs.cursorBlink; $('#motion-setting').checked = state.prefs.reduceMotion;
  $('#focus-setting').checked = state.prefs.focusTerminal; $('#history-setting').checked = state.prefs.keepHistory;
  $('#verbose-setting').checked = state.prefs.verboseSSH;
  requestAnimationFrame(() => { if ($('#terminal-modal').classList.contains('open')) fitTerminal(); });
}
function fitTerminal() {
  if (!$('#terminal-output').clientWidth) return;
  fitAddon.fit();
  if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
}
function esc(value) { return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function modal(id, open = true) { $(`#${id}`).classList.toggle('open', open); }
function toast(message) { let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.append(el); } el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2200); }
function record(message) { if (!state.prefs.keepHistory) return; state.activity.unshift({ message, at: new Date().toISOString() }); state.activity = state.activity.slice(0, 80); save('shellbay-activity', state.activity); renderActivity(); }
function renderHosts() {
  const query = $('#host-search').value.toLowerCase();
  const visible = state.hosts.filter(h => `${h.name} ${h.address}`.toLowerCase().includes(query));
  $('#host-count').textContent = state.hosts.length;
  $('#empty-state').hidden = state.hosts.length > 0;
  $('#host-list').innerHTML = visible.map(h => `<article class="host-card"><div class="host-card-head"><div class="host-avatar">⌘</div><div><div class="host-name">${esc(h.name)}</div><div class="host-address">${esc(h.user ? `${h.user}@${h.address}` : h.address)}</div></div><div class="host-actions"><button class="mini-button" title="Edit" data-edit="${h.id}">✎</button><button class="mini-button" title="Remove" data-delete="${h.id}">×</button></div></div><div class="host-card-foot"><span class="host-port">SSH · port ${esc(h.port)}</span><button class="connect-button" data-connect="${h.id}">Connect&nbsp; →</button></div></article>`).join('');
  $$('[data-connect]').forEach(b => b.onclick = () => connect(state.hosts.find(h => h.id === b.dataset.connect)));
  $$('[data-edit]').forEach(b => b.onclick = () => editHost(b.dataset.edit));
  $$('[data-delete]').forEach(b => b.onclick = () => { state.hosts = state.hosts.filter(h => h.id !== b.dataset.delete); save('shellbay-hosts', state.hosts); renderHosts(); toast('Connection removed'); });
}
function editHost(id) { const h = state.hosts.find(x => x.id === id); if (!h) return; $('#host-modal-title').textContent = 'Edit connection'; $('#edit-id').value = id; $('#host-name').value = h.name; $('#host-address').value = h.address; $('#host-port').value = h.port; $('#host-user').value = h.user || ''; $('#host-identity').value = h.identity || ''; modal('host-modal'); }
function renderActivity() { $('#activity-list').innerHTML = state.activity.length ? state.activity.map(a => `<div class="activity-item"><span>${esc(a.message)}</span><time>${new Date(a.at).toLocaleString()}</time></div>`).join('') : '<div class="empty-state"><h3>No activity yet</h3><p>Your recent SSH connections will appear here.</p></div>'; }
function renderTools() {
  const query = $('#tool-search').value.toLowerCase();
  const filtered = tools.filter(t => (state.activeCategory === 'All' || t.category === state.activeCategory) && `${t.name} ${t.command} ${t.category}`.toLowerCase().includes(query));
  $('#tool-grid').innerHTML = filtered.length ? filtered.map((t, i) => `<button class="tool-card" data-tool-index="${i}" title="Click to put this command in the terminal"><strong>${esc(t.name)}</strong><code>${esc(t.command)}</code><small>${esc(t.category)}</small></button>`).join('') : '<div class="no-results">No tools match this search.</div>';
  $$('#tool-grid .tool-card').forEach((b, i) => b.onclick = () => { const item = filtered[i]; if (!state.connected || !state.socket || state.socket.readyState !== WebSocket.OPEN) { toast('Connect to a host first'); return; } modal('terminal-modal'); requestAnimationFrame(() => { fitTerminal(); terminal.paste(item.command); terminal.focus(); }); });
}
function renderCategories() { $('#categories').innerHTML = ['All', ...Object.keys(categories)].map(c => `<button class="category-button ${state.activeCategory === c ? 'selected' : ''}" data-category="${esc(c)}">${esc(c)}</button>`).join(''); $$('#categories button').forEach(b => b.onclick = () => { state.activeCategory = b.dataset.category; renderCategories(); renderTools(); }); }
function setView(name) { $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name)); $$('.view').forEach(v => v.classList.remove('active-view')); $(`#${name}-view`).classList.add('active-view'); $('#crumb').textContent = name[0].toUpperCase() + name.slice(1); }
function sendTerminalInput(data) { if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify({ type: 'input', data })); }
function detectAuthPrompt(data) {
  state.authPromptBuffer = (state.authPromptBuffer + data).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\r\n]+/g, ' ').slice(-500);
  const match = state.authPromptBuffer.match(/(?:password|passphrase|verification code|one[- ]time code|passcode)[^:\r\n]{0,100}:\s*$/i);
  if (!match) return;
  const prompt = match[0].trim();
  state.authPromptBuffer = '';
  if (!state.passwordPromptAllowed) {
    state.passwordPromptBlocked = true;
    terminal.options.disableStdin = true;
    $('#terminal-hint').textContent = 'Password prompts require opening Shellbay on localhost';
    toast('Password entry is disabled for browser-over-LAN sessions');
    return;
  }
  if (state.passwordPromptOpen) return;
  state.passwordPromptOpen = true;
  const isPassphrase = /passphrase/i.test(prompt);
  $('#ssh-password-title').textContent = isPassphrase ? 'Key passphrase' : 'SSH password';
  $('#ssh-password-label').textContent = isPassphrase ? 'Passphrase' : /verification|one[- ]time|passcode/i.test(prompt) ? 'Verification code' : 'Password';
  $('#ssh-password-help').textContent = `Shellbay is asking: ${prompt}`;
  $('#ssh-password').value = '';
  modal('ssh-password-modal');
  requestAnimationFrame(() => $('#ssh-password').focus());
}
function closePasswordPrompt(cancel = false) {
  $('#ssh-password').value = '';
  state.passwordPromptOpen = false;
  modal('ssh-password-modal', false);
  if (cancel) sendTerminalInput('\u0003');
  else terminal.focus();
}
function connect(host) {
  if (!host) return;
  if (state.socket) { state.socket.send(JSON.stringify({ type: 'disconnect' })); state.socket.close(); state.socket = null; }
  terminal.reset(); terminal.write('\x1b[1;32mShellbay SSH Studio\x1b[0m\r\nOpening an SSH session to ' + host.address + ':' + host.port + '…\r\n\r\n');
  $('#terminal-title').textContent = `Shellbay Terminal · ${host.name}`;
  $('#terminal-host-label').textContent = `${host.address}:${host.port}`;
  $('#terminal-state').textContent = 'Connecting'; $('#terminal-state-dot').classList.remove('connected'); $('#terminal-hint').textContent = 'Waiting for SSH authentication';
  modal('terminal-modal');
  requestAnimationFrame(() => { fitTerminal(); if (state.prefs.focusTerminal) terminal.focus(); });
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/terminal`);
  state.socket = ws; state.connected = false; state.terminalReady = false; state.sshDebugBuffer = ''; state.passwordPromptAllowed = false; state.passwordPromptOpen = false; state.passwordPromptBlocked = false; state.authPromptBuffer = ''; terminal.options.disableStdin = true;
  ws.onopen = () => ws.send(JSON.stringify({ type: 'connect', host: host.address, port: host.port, user: host.user || '', identity: host.identity || '', timeout: state.prefs.connectTimeout, keepalive: state.prefs.keepalive, verbose: state.prefs.verboseSSH, cols: terminal.cols, rows: terminal.rows }));
  ws.onmessage = event => {
    let m; try { m = JSON.parse(event.data); } catch { return; }
    if (m.type === 'auth-capability') { state.passwordPromptAllowed = m.passwordPrompt === true; return; }
    if (m.type === 'output') {
      detectAuthPrompt(m.data);
      terminal.write(m.data); state.sshDebugBuffer = (state.sshDebugBuffer + m.data).slice(-8192);
      const failed = /permission denied|connection (?:refused|timed out)|no route to host|host key verification failed|could not resolve hostname|bad owner or permissions/i.test(state.sshDebugBuffer);
      const authenticated = !state.prefs.verboseSSH || /Authenticated to .* using|Entering interactive session/i.test(state.sshDebugBuffer);
      if (failed) { state.connected = false; state.terminalReady = true; terminal.options.disableStdin = true; $('#terminal-state').textContent = 'SSH error'; $('#terminal-state-dot').classList.remove('connected'); $('#terminal-hint').textContent = 'Connection failed · see terminal output'; $('#session-count').textContent = '0'; }
      else if (authenticated) { state.connected = true; state.terminalReady = true; terminal.options.disableStdin = false; $('#terminal-state').textContent = 'SSH output'; $('#terminal-state-dot').classList.add('connected'); $('#terminal-hint').textContent = 'Terminal ready · Ctrl+C interrupts'; $('#session-count').textContent = '1'; }
      else { $('#terminal-state').textContent = 'SSH diagnostics'; $('#terminal-hint').textContent = 'Reading SSH handshake details'; }
    }
    if (m.type === 'status') {
      if (m.data.startsWith('Connecting')) { $('#terminal-state').textContent = 'Connecting'; terminal.write(`\x1b[90m${m.data}\x1b[0m\r\n`); }
      else if (m.data.startsWith('SSH process started')) { $('#terminal-state').textContent = 'Waiting for SSH'; terminal.write(`\x1b[90m${m.data}\x1b[0m\r\n`); }
      else if (m.data.includes('closed')) { state.connected = false; terminal.options.disableStdin = true; $('#terminal-state').textContent = 'Disconnected'; $('#terminal-state-dot').classList.remove('connected'); $('#terminal-hint').textContent = 'Session ended · reconnect to continue'; $('#session-count').textContent = '0'; terminal.write(`\r\n\x1b[90m${m.data}\x1b[0m\r\n`); }
    }
    if (m.type === 'error') terminal.write(`\r\n\x1b[31m${m.data}\x1b[0m\r\n`);
  };
  ws.onerror = () => { state.connected = false; terminal.options.disableStdin = true; $('#terminal-state').textContent = 'Connection error'; $('#terminal-hint').textContent = 'Web terminal transport failed'; terminal.write('\r\n\x1b[31mUnable to open the terminal connection. Refresh and try again.\x1b[0m\r\n'); };
  ws.onclose = () => { if (state.passwordPromptOpen) closePasswordPrompt(); state.connected = false; terminal.options.disableStdin = true; state.terminalReady = false; $('#session-count').textContent = '0'; if (!$('#terminal-state').textContent.includes('Disconnected')) $('#terminal-state').textContent = 'Disconnected'; };
  record(`Opened SSH session to ${host.name} (${host.address})`);
}

$$('.nav-item').forEach(b => b.onclick = () => setView(b.dataset.view));
$('#new-connection').onclick = $('#empty-add').onclick = () => { $('#host-form').reset(); $('#edit-id').value = ''; $('#host-modal-title').textContent = 'New connection'; $('#host-port').value = 22; modal('host-modal'); };
$$('[data-close]').forEach(b => b.onclick = () => modal(b.dataset.close, false));
$$('.modal-backdrop').forEach(b => b.addEventListener('click', e => { if (e.target === b && b.id !== 'pair-modal') modal(b.id, false); }));
$('#host-form').onsubmit = e => { e.preventDefault(); const id = $('#edit-id').value || crypto.randomUUID(); const host = { id, name: $('#host-name').value.trim(), address: $('#host-address').value.trim(), port: Number($('#host-port').value) || 22, user: $('#host-user').value.trim(), identity: $('#host-identity').value.trim() }; const index = state.hosts.findIndex(h => h.id === id); if (index >= 0) state.hosts[index] = host; else state.hosts.push(host); save('shellbay-hosts', state.hosts); renderHosts(); modal('host-modal', false); toast(index >= 0 ? 'Connection updated' : 'Connection saved'); };
$('#host-search').oninput = renderHosts; $('#tool-search').oninput = renderTools;
terminal.onData(data => { if (state.connected && !state.passwordPromptBlocked && state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify({ type: 'input', data })); });
terminal.onResize(({ cols, rows }) => { if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify({ type: 'resize', cols, rows })); });
terminal.onKey(({ domEvent }) => {
  if (domEvent.ctrlKey && domEvent.shiftKey && domEvent.key.toLowerCase() === 'f') { domEvent.preventDefault(); $('#terminal-search').focus(); $('#terminal-search').select(); }
  if (domEvent.ctrlKey && domEvent.shiftKey && domEvent.key.toLowerCase() === 'c') { domEvent.preventDefault(); copyTerminalSelection(); }
});
function copyTerminalSelection() {
  const selected = terminal.getSelection();
  if (!selected) { toast('Select terminal text first'); return; }
  if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(selected).then(() => toast('Selection copied')).catch(() => toast('Clipboard access is unavailable')); return; }
  const scratch = document.createElement('textarea'); scratch.value = selected; scratch.style.position = 'fixed'; scratch.style.opacity = '0'; document.body.append(scratch); scratch.select();
  const copied = document.execCommand('copy'); scratch.remove(); toast(copied ? 'Selection copied' : 'Clipboard access is unavailable');
}
function terminalTranscript() {
  const buffer = terminal.buffer.active;
  return Array.from({ length: buffer.length }, (_, i) => buffer.getLine(i)?.translateToString(true) ?? '').join('\n');
}
function saveTerminalTranscript() {
  const text = terminalTranscript();
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `shellbay-${new Date().toISOString().replaceAll(':', '-')}.log`; link.click(); URL.revokeObjectURL(link.href);
}
$('#terminal-search').oninput = e => { if (e.target.value) searchAddon.findNext(e.target.value); };
$('#terminal-search').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? searchAddon.findPrevious(e.target.value) : searchAddon.findNext(e.target.value); } if (e.key === 'Escape') { e.target.value = ''; searchAddon.clearDecorations(); terminal.focus(); } };
$('#terminal-find-next').onclick = () => { const value = $('#terminal-search').value; if (value) searchAddon.findNext(value); else { $('#terminal-search').focus(); toast('Type a search term'); } };
$('#terminal-copy').onclick = copyTerminalSelection;
$('#terminal-save').onclick = saveTerminalTranscript;
$('#ssh-password-form').onsubmit = e => { e.preventDefault(); let secret = $('#ssh-password').value; $('#ssh-password').value = ''; if (!secret || state.socket?.readyState !== WebSocket.OPEN) { secret = ''; closePasswordPrompt(); return; } sendTerminalInput(`${secret}\r`); secret = ''; closePasswordPrompt(); };
$('#ssh-password-cancel').onclick = () => closePasswordPrompt(true);
$('#disconnect-button').onclick = () => { if (state.socket?.readyState === WebSocket.OPEN) state.socket.send(JSON.stringify({ type: 'disconnect' })); state.connected = false; $('#session-count').textContent = '0'; $('#terminal-state').textContent = 'Disconnecting'; terminal.write('\r\n\x1b[90mDisconnect requested…\x1b[0m\r\n'); };
$('#clear-terminal').onclick = () => terminal.clear();
$('#terminal-minimize').onclick = () => modal('terminal-modal', false);
$('#terminal-maximize').onclick = () => $('.terminal-window').classList.toggle('maximized');
window.addEventListener('resize', fitTerminal);
if ('ResizeObserver' in window) new ResizeObserver(fitTerminal).observe($('#terminal-output'));
$('#lock-button').onclick = async () => { await fetch('/api/logout', { method: 'POST' }); location.reload(); };
$('#clear-activity').onclick = () => { state.activity = []; save('shellbay-activity', []); renderActivity(); };
$$('[data-theme-choice]').forEach(button => button.onclick = () => { state.prefs.theme = button.dataset.themeChoice; savePrefs(); });
$$('[data-accent-choice]').forEach(button => button.onclick = () => { state.prefs.accent = button.dataset.accentChoice; savePrefs(); });
$('#font-size-setting').oninput = e => { state.prefs.fontSize = Number(e.target.value); savePrefs(); };
$('#scrollback-setting').oninput = e => { state.prefs.scrollback = Number(e.target.value); savePrefs(); };
$('#cursor-blink-setting').onchange = e => { state.prefs.cursorBlink = e.target.checked; savePrefs(); };
$('#motion-setting').onchange = e => { state.prefs.reduceMotion = e.target.checked; savePrefs(); };
$('#focus-setting').onchange = e => { state.prefs.focusTerminal = e.target.checked; savePrefs(); };
$('#history-setting').onchange = e => { state.prefs.keepHistory = e.target.checked; if (!state.prefs.keepHistory) { state.activity = []; save('shellbay-activity', []); renderActivity(); } savePrefs(); };
$('#timeout-setting').oninput = e => { state.prefs.connectTimeout = Number(e.target.value); savePrefs(); };
$('#keepalive-setting').oninput = e => { state.prefs.keepalive = Number(e.target.value); savePrefs(); };
$('#verbose-setting').onchange = e => { state.prefs.verboseSSH = e.target.checked; savePrefs(); };
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (state.prefs.theme === 'system') applyPrefs(); });
$('#pair-form').onsubmit = async e => { e.preventDefault(); const res = await fetch('/api/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: $('#pair-code').value }) }); const result = await res.json(); if (result.ok) { modal('pair-modal', false); toast('Workspace unlocked'); } else $('#pair-error').textContent = result.error || 'Could not unlock workspace.'; };
renderHosts(); renderActivity(); renderCategories(); renderTools(); applyPrefs();
fetch('/api/status').then(r => r.json()).then(status => { if (!status.paired) modal('pair-modal'); }).catch(() => modal('pair-modal'));
