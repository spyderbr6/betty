/**
 * GitHub API Utilities
 * Functions for creating GitHub issues from user feedback
 */

import { FeedbackData } from '../components/ui/FeedbackModal';
import { GITHUB_TOKEN } from '@env';

// GitHub repository configuration
const GITHUB_CONFIG = {
  owner: 'spyderbr6',
  repo: 'betty',
  token: GITHUB_TOKEN || 'demo_mode',
};

interface GitHubIssue {
  title: string;
  body: string;
  labels: string[];
}

/**
 * Converts feedback data to GitHub issue format
 */
const formatFeedbackAsGitHubIssue = (feedback: FeedbackData): GitHubIssue => {
  const typeLabels = {
    bug: ['bug', 'user-feedback'],
    feature: ['enhancement', 'user-feedback'],
    improvement: ['improvement', 'user-feedback'],
    question: ['question', 'user-feedback'],
  };

  const typeEmojis = {
    bug: '🐛',
    feature: '✨',
    improvement: '🔧',
    question: '❓',
  };

  const body = `
## User Feedback

**Type:** ${feedback.type.charAt(0).toUpperCase() + feedback.type.slice(1)}

**Description:**
${feedback.description}

---

**Source:** SideBet Mobile App
**Submitted:** ${new Date().toISOString()}
**Auto-generated from in-app feedback**
`.trim();

  return {
    title: `${typeEmojis[feedback.type]} ${feedback.title}`,
    body,
    labels: typeLabels[feedback.type],
  };
};

/**
 * Submits feedback as a GitHub issue
 */
export const submitFeedbackToGitHub = async (feedback: FeedbackData): Promise<void> => {
  const issue = formatFeedbackAsGitHubIssue(feedback);

  // In demo mode, just log the issue instead of making real API call
  if (GITHUB_CONFIG.token === 'demo_mode') {
    console.log('=== DEMO MODE: GitHub Issue Would Be Created ===');
    console.log('Repository:', `${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`);
    console.log('Title:', issue.title);
    console.log('Labels:', issue.labels.join(', '));
    console.log('Body:', issue.body);
    console.log('===============================================');

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    return;
  }

  // Real GitHub API implementation (when token is provided)
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/issues`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'Authorization': `token ${GITHUB_CONFIG.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(issue),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`GitHub API error: ${response.status} - ${errorData.message}`);
    }

    const createdIssue = await response.json();
    console.log('GitHub issue created successfully:', createdIssue.html_url);
  } catch (error) {
    console.error('Failed to create GitHub issue:', error);
    throw new Error('Failed to submit feedback. Please try again.');
  }
};

/**
 * Validates GitHub configuration
 */
export const isGitHubConfigured = (): boolean => {
  return GITHUB_CONFIG.token !== 'demo_mode' &&
         GITHUB_CONFIG.owner !== 'your-username' &&
         GITHUB_CONFIG.repo !== 'your-repo';
};

/**
 * Gets the GitHub repository URL for reference
 */
export const getRepositoryUrl = (): string => {
  return `https://github.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}`;
};