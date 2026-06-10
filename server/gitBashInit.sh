# Git Bash-style prompt (LF only — do not save with CRLF)
git_branch_label() {
  local b
  b=$(git branch --show-current 2>/dev/null)
  if [ -z "$b" ] && [ -f .git/HEAD ]; then
    b=$(sed -n 's|^ref: refs/heads/||p' .git/HEAD 2>/dev/null)
  fi
  [ -n "$b" ] && printf ' (%s)' "$b"
}

set_git_bash_prompt() {
  local gb
  gb=$(git_branch_label)
  PS1=$'\[\033]0;MINGW64:'"${PWD}"$'\007\[\033[32m\]\u@\h \[\033[35m\]MINGW64\[\033[0m\] \[\033[33m\]\w\[\033[36m\]'"${gb}"$'\[\033[0m\]\n\[\033[32m\]$ \[\033[0m\]'
}

PROMPT_COMMAND=set_git_bash_prompt
set_git_bash_prompt

export HISTCONTROL=ignoreboth
export HISTSIZE=2000
shopt -s checkwinsize 2>/dev/null

alias ll='ls -la'
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git pull'
alias gps='git push'
alias gd='git diff'
alias gl='git log --oneline -15'

rm -f "$0" 2>/dev/null
