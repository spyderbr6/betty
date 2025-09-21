import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { betStateManager } from './functions/bet-state-manager/resource';
import { scheduledBetChecker } from './functions/scheduled-bet-checker/resource';

const backend = defineBackend({
  auth,
  data,
  storage,
  betStateManager,
  scheduledBetChecker,
});

// Grant the Lambda functions access to the data layer
backend.data.resources.graphqlApi.grantQuery(backend.betStateManager.resources.lambda, "private");
backend.data.resources.graphqlApi.grantMutation(backend.betStateManager.resources.lambda, "private");

backend.data.resources.graphqlApi.grantQuery(backend.scheduledBetChecker.resources.lambda, "private");
backend.data.resources.graphqlApi.grantMutation(backend.scheduledBetChecker.resources.lambda, "private");
