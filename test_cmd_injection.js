const { spawnSync } = require('child_process');

function escapeCmdArg(arg) {
  // First escape double quotes by doubling them, then enclose in double quotes.
  // BUT cmd.exe removes the outer double quotes and interprets the inside.
  // Actually, we don't need to enclose in double quotes, we need to pass a single string to /c.

  // A robust way to escape for cmd.exe when we have windowsVerbatimArguments:
  // Since we use /c "entire command line", cmd.exe will parse it.

  // This is how cross-spawn escapes for cmd.exe:
  const escaped = arg.replace(/([()\][%!^"`<>&|;, *?])/g, '^$1');
  return escaped;
}

const args = ['hello " & echo INJECTED', 'test%PATH%test'];
const escapedArgs = args.map(escapeCmdArg).join(' ');

console.log(escapedArgs);
