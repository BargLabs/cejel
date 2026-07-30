import { execFileSync as run } from 'child_process';

export function runProcess(): string {
  return run('git', ['status'], { encoding: 'utf8' });
}
