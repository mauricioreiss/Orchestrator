#!/bin/bash
# ============================================
# Ralph Loop — Autonomous AI Development Loop
# ============================================
# Runs Claude Code in a loop, one story per iteration, fresh context each round.
# Each iteration: read prd.json → implement story → build → commit → next.
#
# Usage:
#   bash scripts/ralph/ralph.sh [max_iterations] [options]
#
# Options:
#   --no-commit    Skip git commit (MauMau reviews first)
#   --dry-run      Show what would run without executing
#
# Prerequisites:
#   - Claude Code installed (npm i -g @anthropic-ai/claude-code)
#   - Git repo initialized with at least one commit
#   - prd.json in project root with stories
#   - CLAUDE.md in project root with project spec
#   - Node.js 18+ (used for JSON parsing instead of jq)
#
# Setup for a new project:
#   1. Copy this folder (ralph-loop/) to your project: scripts/ralph/
#   2. Copy prd-template.json to project root as prd.json
#   3. Fill in prd.json with your stories
#   4. Add Ralph Loop Protocol section to your CLAUDE.md (see claude-md-section.md)
#   5. Run: bash scripts/ralph/ralph.sh 10

set -e

# --- Args ---
MAX_ITER=${1:-10}
NO_COMMIT=false
DRY_RUN=false

for arg in "$@"; do
  case $arg in
    --no-commit) NO_COMMIT=true ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

# --- Paths ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRD_FILE="$PROJECT_DIR/prd.json"
PROGRESS_FILE="$PROJECT_DIR/progress.txt"

# --- Validation ---
if [ ! -f "$PRD_FILE" ]; then
  echo "ERROR: prd.json not found at $PRD_FILE"
  echo "Copy prd-template.json to your project root as prd.json"
  exit 1
fi

if [ ! -f "$PROJECT_DIR/CLAUDE.md" ]; then
  echo "ERROR: CLAUDE.md not found at $PROJECT_DIR/CLAUDE.md"
  echo "Create a CLAUDE.md with your project spec and Ralph Loop Protocol"
  exit 1
fi

if ! git -C "$PROJECT_DIR" rev-parse --git-dir > /dev/null 2>&1; then
  echo "ERROR: Not a git repository. Run: git init && git add -A && git commit -m 'init'"
  exit 1
fi

# --- Build command detection ---
BUILD_CMD=""
if [ -f "$PROJECT_DIR/package.json" ]; then
  if node -e "const p=JSON.parse(require('fs').readFileSync('$PROJECT_DIR/package.json','utf8'));process.exit(p.scripts&&p.scripts.lint?0:1)" 2>/dev/null; then
    BUILD_CMD="npm run lint && npm run build"
  else
    BUILD_CMD="npm run build"
  fi
elif [ -f "$PROJECT_DIR/Cargo.toml" ]; then
  BUILD_CMD="cargo build"
elif [ -f "$PROJECT_DIR/pyproject.toml" ] || [ -f "$PROJECT_DIR/setup.py" ] || [ -f "$PROJECT_DIR/requirements.txt" ]; then
  if [ -f "$PROJECT_DIR/pyproject.toml" ] && grep -q "pytest" "$PROJECT_DIR/pyproject.toml" 2>/dev/null; then
    BUILD_CMD="python -m pytest --tb=short -q"
  elif [ -f "$PROJECT_DIR/Makefile" ] && grep -q "lint" "$PROJECT_DIR/Makefile" 2>/dev/null; then
    BUILD_CMD="make lint"
  else
    BUILD_CMD="flake8 --select=E9,F63,F7,F82 --show-source . || python -m py_compile"
  fi
elif [ -f "$PROJECT_DIR/go.mod" ]; then
  BUILD_CMD="go build ./..."
fi

# --- Commit flag for prompt ---
COMMIT_INSTRUCTION="git add the changed files and commit with message: feat(story-N): <story title>"
if [ "$NO_COMMIT" = true ]; then
  COMMIT_INSTRUCTION="Do NOT commit. MauMau reviews first."
fi

# --- Branch safety ---
CURRENT_BRANCH=$(git -C "$PROJECT_DIR" branch --show-current 2>/dev/null || echo "unknown")
MAIN_BRANCHES="main master"
for mb in $MAIN_BRANCHES; do
  if [ "$CURRENT_BRANCH" = "$mb" ] && [ "$NO_COMMIT" = false ]; then
    echo "WARNING: You are on '$mb' with auto-commit enabled."
    echo "Ralph Loop should run on a feature branch."
    echo "Create one: git checkout -b ralph/feature-name"
    echo "Or use --no-commit to disable auto-commit."
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      exit 1
    fi
  fi
done

# --- Header ---
echo "========================================"
echo " Ralph Loop"
echo " Max iterations: $MAX_ITER"
echo " Project: $PROJECT_DIR"
echo " Build: ${BUILD_CMD:-none detected}"
echo " Commit: $([ "$NO_COMMIT" = true ] && echo 'disabled' || echo 'enabled')"
echo "========================================"
echo ""

# --- Loop ---
COUNT=0

while [ $COUNT -lt $MAX_ITER ]; do
    COUNT=$((COUNT + 1))

    # Count remaining stories
    REMAINING=$(node -e "
        const prd = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
        const stories = prd.stories || prd;
        const incomplete = (Array.isArray(stories) ? stories : []).filter(s => !s.passes);
        console.log(incomplete.length);
    " "$PRD_FILE" 2>/dev/null || echo "0")

    if [ "$REMAINING" = "0" ]; then
        echo ""
        echo "========================================"
        echo " ALL STORIES COMPLETE"
        echo "========================================"
        break
    fi

    # Get next story info
    NEXT_STORY=$(node -e "
        const prd = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
        const stories = prd.stories || prd;
        const next = (Array.isArray(stories) ? stories : []).find(s => !s.passes);
        if (next) console.log(next.id + ': ' + next.title);
        else console.log('none');
    " "$PRD_FILE" 2>/dev/null || echo "unknown")

    echo "--- Iteration $COUNT/$MAX_ITER ---"
    echo "Story: $NEXT_STORY"
    echo "Remaining: $REMAINING stories"
    echo "---"

    if [ "$DRY_RUN" = true ]; then
        echo "[DRY RUN] Would run Claude Code for story: $NEXT_STORY"
        echo ""
        continue
    fi

    cd "$PROJECT_DIR"
    claude --dangerously-skip-permissions \
        -p "You are inside a Ralph Loop iteration. Read CLAUDE.md for full project context and coding rules. Read prd.json to find the next story where passes is false. Read progress.txt to learn from previous iterations. Implement ONLY that one story. Run build/test to verify. If build passes: $COMMIT_INSTRUCTION. Update prd.json setting that story's passes to true. Append learnings to progress.txt. Then exit."

    echo ""
    echo "--- Iteration $COUNT done ---"
    echo ""

    sleep 3
done

# --- Summary ---
echo ""
COMPLETED=$(node -e "
    const prd = JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));
    const stories = prd.stories || prd;
    const done = (Array.isArray(stories) ? stories : []).filter(s => s.passes).length;
    const total = (Array.isArray(stories) ? stories : []).length;
    console.log(done + '/' + total);
" "$PRD_FILE" 2>/dev/null || echo "?/?")

echo "========================================"
echo " Ralph Loop finished"
echo " Iterations: $COUNT"
echo " Stories completed: $COMPLETED"
echo "========================================"
