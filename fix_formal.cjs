const fs = require('fs');

let content = fs.readFileSync('src/verify/formal.ts', 'utf8');

// Replace the buggy resolveProcessInvocation block
content = content.replace(
  /  if \(\/\\.\(cmd\|bat\)\$\/i\.test\(resolvedCommand\)\) \{[\s\S]*?windowsVerbatimArguments: true,[\s\S]*?\};[\s\S]*?  \}/m,
  `  if (/\\.(cmd|bat)$/i.test(resolvedCommand)) {
    // SECURITY: Use caret (^) escaping for cmd.exe shell metacharacters when wrapping
    // in verbatim arguments mode to prevent command injection.
    const escapedArgs = args.map((arg) => {
      // Escape cmd metacharacters with ^
      return arg.replace(/([()\\\][%!^"<>&|;, *?])/g, "^$1");
    }).join(" ");

    const shellCommand = \`\${resolvedCommand} \${escapedArgs}\`;

    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", shellCommand],
      windowsVerbatimArguments: true,
    };
  }`
);

fs.writeFileSync('src/verify/formal.ts', content, 'utf8');
