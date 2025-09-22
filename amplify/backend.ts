import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { scheduledBetChecker } from './functions/scheduled-bet-checker/resource';

const backend = defineBackend({
  auth,
  data,
  storage,
  scheduledBetChecker,
});

// Grant the Lambda function access to the data layer
backend.data.resources.graphqlApi.grantQuery(backend.scheduledBetChecker.resources.lambda, "private");
backend.data.resources.graphqlApi.grantMutation(backend.scheduledBetChecker.resources.lambda, "private");

// EventBridge schedules are configured directly in the function resource files
