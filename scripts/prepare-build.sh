#!/bin/bash
# Script to prepare gradle.properties for EAS Build

echo "Preparing gradle.properties for EAS Build..."

# Remove Windows-specific Java home setting
sed -i '/org.gradle.java.home=C:/d' android/gradle.properties

echo "gradle.properties prepared for EAS Build"