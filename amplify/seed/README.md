# Sandbox seeding

`npx ampx sandbox seed` fills the sandbox with enough live bets to measure the
join feed at scale. It writes to DynamoDB directly (BatchWriteItem, 25 rows per
request) rather than issuing one GraphQL mutation per row.

## Required IAM permission

The seed runs as your local AWS identity, which by default cannot write to the
table. Without this you get:

```
User: arn:aws:iam::<account>:user/amplify-dev
is not authorized to perform: dynamodb:BatchWriteItem
```

Attach the policy below to that user. It is scoped to **this sandbox's tables
only** — the suffix is the sandbox's AppSync api id, so it cannot reach
production or another developer's sandbox.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SeedSidebetSandboxTables",
      "Effect": "Allow",
      "Action": [
        "dynamodb:BatchWriteItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:DescribeTable"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-east-2:920373006612:table/*-buu2cjrtfzb33grzxipokuqgie-NONE",
        "arn:aws:dynamodb:us-east-2:920373006612:table/*-buu2cjrtfzb33grzxipokuqgie-NONE/index/*"
      ]
    },
    {
      "Sid": "ResolveSandboxTableNames",
      "Effect": "Allow",
      "Action": ["cloudformation:ListStackResources"],
      "Resource": "arn:aws:cloudformation:us-east-2:920373006612:stack/amplify-sidebet-Desktop-sandbox-*/*"
    }
  ]
}
```

**The api id changes if the sandbox is deleted and recreated.** Find the current
one from any table name: `<Model>-<apiId>-NONE`.

## Why the table is resolved from CloudFormation

This account has three `Bet-*` tables. They differ only by an opaque api id, and
the id is **not** the AppSync hostname prefix — an early version guessed that and
would have written thousands of test rows into the wrong environment. The seed
now walks the sandbox stack and aborts unless exactly one table matches.

Note Amplify Gen2 provisions tables as `Custom::AmplifyDynamoDBTable`, not
`AWS::DynamoDB::Table`, so a walk filtering only on the latter finds nothing.

## Options

| Variable | Default | Meaning |
| --- | --- | --- |
| `SEED_BET_COUNT` | 2000 | How many bets to write |
| `SEED_DEADLINE_MIN_DAYS` | 3 | Earliest deadline, days out |
| `SEED_DEADLINE_MAX_DAYS` | 7 | Latest deadline, days out |
| `SEED_CREATOR_ID` | `seed-user-0000` | Cognito sub recorded as creator |
| `SEED_STACK_NAME` | the Desktop sandbox | Stack to resolve tables from |

Deadlines default to days out so seeded bets stay `ACTIVE` long enough to be
worth interacting with.

Set `SEED_CREATOR_ID` to your own Cognito sub if you want the seeded bets to
appear as *yours* in the app; leave it alone for them to look like other
people's bets, which is what the joinable feed needs.

## What seeded rows cannot do

Rows written this way have no `owner` field, because only AppSync populates it.
`Bet` grants `authenticated().to(['read'])` unconditionally, so they read back
fine for any signed-in user — but owner-scoped mutations (delete, and update via
the owner rule) will not apply to them. They are for read, list, filter and join
paths, which is what the scale test exercises.

Every seeded row carries `seed:scale-test` in its description and an id prefixed
`seed-bet-`, so they can be found and removed again.
