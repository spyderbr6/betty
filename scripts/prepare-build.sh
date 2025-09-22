#!/bin/bash
# Script to prepare gradle.properties for EAS Build

echo "Preparing gradle.properties for EAS Build..."

# Backup original and use EAS-specific version
echo "Backing up original gradle.properties..."
cp android/gradle.properties android/gradle.properties.backup

echo "Using EAS-specific gradle.properties..."
cp android/gradle.eas.properties android/gradle.properties

echo "gradle.properties updated for EAS Build"