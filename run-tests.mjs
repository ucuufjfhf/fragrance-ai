import { execSync } from 'child_process';
try {
  const output = execSync('node --experimental-strip-types C:\\Users\\Admin\\fragrance-ai\\node_modules\\.bin\\vitest.cjs run', { maxBuffer: 1024*1024, timeout: 120000 });
  console.log(output.toString());
} catch (e) {
  console.log('STDOUT:', e.stdout?.toString());
  console.log('STDERR:', e.stderr?.toString());
}