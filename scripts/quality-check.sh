#!/usr/bin/env bash
# 品質チェック一括実行スクリプト。
# CI (.github/workflows/ci.yml) と Claude Code (.github/workflows/claude.yml) の
# 両方がこのスクリプトを唯一のゲートとして使う。ローカルでもコミット前に
# `bash scripts/quality-check.sh` で同じ検証ができる。
#
# 全ステップを最後まで実行してから失敗をまとめて報告する
# (途中で止めない方が、修正すべき箇所を一度に把握できるため)。
set -u

cd "$(dirname "$0")/.." || exit 1

# macOS 標準の bash 3.2 でも動くよう、配列ではなく文字列で失敗を蓄積する
failed=""

run_step() {
  step_name="$1"
  shift
  echo ""
  echo "=== ${step_name} ==="
  if "$@"; then
    echo "--- ${step_name}: OK"
  else
    echo "--- ${step_name}: FAILED"
    failed="${failed} [${step_name}]"
  fi
}

run_step "lint" npm run lint
run_step "build" npm run build
run_step "test" npm run test

echo ""
if [ -n "${failed}" ]; then
  echo "quality-check: FAILED ->${failed}"
  exit 1
fi
echo "quality-check: all checks passed"
