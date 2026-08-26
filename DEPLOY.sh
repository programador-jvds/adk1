#!/usr/bin/env bash
set -e
firebase deploy --only firestore:rules,hosting
