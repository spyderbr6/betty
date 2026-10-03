#!/usr/bin/env node
/**
 * Synthesize the Amplify backend locally and check the CloudFormation it produces for
 * mistakes that only show up when AWS creates the resources — the kind `tsc` and a
 * successful synth both miss. Run before merging anything under amplify/:
 *
 *   npm run check:backend
 *
 * Why it exists: the first deploy of the notifications dispatcher created a stream
 * event source mapping in parallel with the IAM policy that let its function read the
 * stream. Lambda checks that permission when the mapping is created, so the deploy
 * failed — and its rollback then failed too, because DynamoDB allows one TTL change per
 * table per hour (PUSH_NOTIFICATION_GUIDE.md §9). Synth succeeded throughout.
 *
 * This is not a substitute for a sandbox deploy (CLAUDE.md, "Backend deploys"); it only
 * catches the known traps below before anything reaches AWS.
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = mkdtempSync(join(tmpdir(), 'sidebet-synth-'));
const failures = [];

try {
  console.log('Synthesizing the backend (bundles every function; takes a minute or two)...');
  execSync(
    [
      'npx cdk synth',
      '--app "npx tsx amplify/backend.ts"',
      '-c amplify-backend-namespace=check',
      '-c amplify-backend-name=sandbox',
      '-c amplify-backend-type=sandbox',
      `-o "${outDir}"`,
      '--quiet',
    ].join(' '),
    { stdio: ['ignore', 'ignore', 'inherit'] }
  );

  const templates = readdirSync(outDir).filter((f) => f.endsWith('.template.json'));
  for (const file of templates) {
    const resources = JSON.parse(readFileSync(join(outDir, file), 'utf8')).Resources ?? {};
    checkEventSourceMappings(file, resources);
  }
  console.log(`Checked ${templates.length} templates.`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('Backend checks passed.');

/**
 * Every event source mapping must depend on a policy in its own template that grants
 * read on its source. Otherwise CloudFormation may create the mapping first, and Lambda
 * refuses a mapping whose function cannot yet read the source.
 */
function checkEventSourceMappings(file, resources) {
  const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const [id, resource] of Object.entries(resources)) {
    if (resource.Type !== 'AWS::Lambda::EventSourceMapping') continue;
    const source = resource.Properties?.EventSourceArn;
    const dependsOn = [resource.DependsOn ?? []].flat();

    const grantsRead = dependsOn.some((dep) => {
      const policy = resources[dep];
      if (policy?.Type !== 'AWS::IAM::Policy') return false;
      return (policy.Properties?.PolicyDocument?.Statement ?? []).some((statement) => {
        const actions = [statement.Action].flat();
        const targets = [statement.Resource].flat();
        const reads = actions.some((a) => /^(dynamodb:GetRecords|kinesis:GetRecords|sqs:ReceiveMessage|dynamodb:\*|kinesis:\*|sqs:\*)$/.test(a));
        return reads && targets.some((t) => t === '*' || sameValue(t, source));
      });
    });

    if (!grantsRead) {
      failures.push(
        `${file}: ${id} (event source mapping) does not depend on a policy granting read on its source. ` +
          'Add mapping.node.addDependency(policy) in amplify/backend.ts.'
      );
    }
  }
}
