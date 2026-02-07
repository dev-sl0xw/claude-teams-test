#!/usr/bin/env python3
import json
import sys
import subprocess
import os
from datetime import datetime

# ANSI color codes for coding theme
class Colors:
    # Base colors
    RESET = '\033[0m'
    BOLD = '\033[1m'
    DIM = '\033[2m'

    # Coding theme colors (vibrant but professional)
    CYAN = '\033[96m'        # Project/Directories
    BLUE = '\033[94m'        # Git branches
    PURPLE = '\033[95m'      # Model/AI
    GREEN = '\033[38;5;46m'  # Neon green/fluorescent green
    BRIGHT_GREEN = '\033[92m' # Bright green for status
    YELLOW = '\033[93m'      # Warning/Context medium
    RED = '\033[91m'         # Critical/Context low
    MAGENTA = '\033[35m'     # Version/Config
    ORANGE = '\033[38;5;208m'  # Cost/Usage
    GRAY = '\033[90m'        # Time/Secondary info
    WHITE = '\033[97m'       # Output style
    GOLD = '\033[38;5;220m'  # Gold for cost
    LIGHT_PURPLE = '\033[38;5;183m'  # Light purple for model name

def get_git_branch():
    """Get current git branch"""
    try:
        result = subprocess.run(
            ['git', '-c', 'core.fileMode=false', '-c', 'gc.auto=0', 'rev-parse', '--abbrev-ref', 'HEAD'],
            capture_output=True,
            text=True,
            timeout=1
        )
        return result.stdout.strip() if result.returncode == 0 else "no-branch"
    except:
        return "no-branch"

def get_project_name(workspace_path):
    """Extract project name from workspace path"""
    return os.path.basename(workspace_path) if workspace_path else "unknown"

def format_tokens(tokens):
    """Format token numbers with K/M suffixes"""
    if tokens is None:
        return "0"
    if tokens >= 1_000_000:
        return f"{tokens / 1_000_000:.1f}M"
    elif tokens >= 1_000:
        return f"{tokens / 1_000:.1f}K"
    return str(tokens)

def calculate_cost(input_tokens, output_tokens, model_id):
    """Calculate approximate cost based on model pricing"""
    # Pricing per million tokens (approximate, as of 2025)
    pricing = {
        "claude-opus-4": {"input": 15.00, "output": 75.00},
        "claude-sonnet-4": {"input": 3.00, "output": 15.00},
        "claude-sonnet-3-5": {"input": 3.00, "output": 15.00},
        "claude-haiku-3-5": {"input": 0.80, "output": 4.00},
    }

    # Find matching pricing
    model_pricing = None
    for key in pricing:
        if key in model_id.lower():
            model_pricing = pricing[key]
            break

    if not model_pricing:
        model_pricing = {"input": 3.00, "output": 15.00}  # Default to Sonnet pricing

    input_cost = (input_tokens / 1_000_000) * model_pricing["input"]
    output_cost = (output_tokens / 1_000_000) * model_pricing["output"]
    total_cost = input_cost + output_cost

    return total_cost

def get_rules_count(workspace_path):
    """Count rules files in .claud directory"""
    try:
        claude_dir = os.path.join(workspace_path, '.claude')
        if os.path.exists(claude_dir):
            rules_files = [f for f in os.listdir(claude_dir) if f.startswith('rules') and f.endswith('.md')]
            return len(rules_files)
    except:
        pass
    return 0

def get_mcps_count():
    """Get MCP servers count from Claude settings"""
    try:
        settings_path = os.path.expanduser('~/.claude/settings.json')
        if os.path.islink(settings_path):
            settings_path = os.readlink(settings_path)

        if os.path.exists(settings_path):
            with open(settings_path, 'r') as f:
                settings = json.load(f)
                mcps = settings.get('mcpServers', {})
                return len(mcps)
    except:
        pass
    return 0

def get_hooks_count(workspace_path):
    """Count hook files in .claude directory"""
    try:
        claude_dir = os.path.join(workspace_path, '.claude')
        if os.path.exists(claude_dir):
            hooks_files = [f for f in os.listdir(claude_dir) if f.startswith('hook-') and f.endswith('.sh')]
            return len(hooks_files)
    except:
        pass
    return 0

def create_progress_bar(percentage, width=20):
    """Create a progress bar with filled and empty blocks"""
    if percentage is None:
        return "N/A"
    filled = int((percentage / 100) * width)
    empty = width - filled
    bar = "█" * filled + "░" * empty
    return f"[{bar}] {percentage:.1f}%"

def main():
    # Read JSON input from stdin
    input_data = json.load(sys.stdin)

    # Extract data
    model_name = input_data.get('model', {}).get('display_name', 'Unknown Model')
    model_id = input_data.get('model', {}).get('id', '')
    workspace_path = input_data.get('workspace', {}).get('project_dir', '')
    version = input_data.get('version', 'unknown')
    output_style = input_data.get('output_style', {}).get('name', 'default')

    # Context window data
    context = input_data.get('context_window', {})
    remaining_pct = context.get('remaining_percentage')
    total_input = context.get('total_input_tokens', 0)
    total_output = context.get('total_output_tokens', 0)

    # Get additional info
    project_name = get_project_name(workspace_path)
    branch = get_git_branch()
    current_time = datetime.now().strftime("%Y-%m-%d | %H:%M")

    # Calculate cost
    cost = calculate_cost(total_input, total_output, model_id)

    # Get counts
    rules_count = get_rules_count(workspace_path)
    mcps_count = get_mcps_count()
    hooks_count = get_hooks_count(workspace_path)

    # Format context remaining with color and progress bar
    if remaining_pct is not None:
        if remaining_pct > 50:
            context_color = Colors.BRIGHT_GREEN
            context_icon = "🟢"
        elif remaining_pct > 20:
            context_color = Colors.YELLOW
            context_icon = "🟡"
        else:
            context_color = Colors.RED
            context_icon = "🔴"
        progress_bar = create_progress_bar(remaining_pct)
        context_str = f"{context_color}{context_icon} {progress_bar}{Colors.RESET}"
    else:
        context_str = f"{Colors.WHITE}⚪ N/A{Colors.RESET}"

    # Format usage/cost with color (reversed order: cost, output, input)
    usage_str = f"{Colors.WHITE}💰 {Colors.GOLD}${cost:.4f}{Colors.WHITE} | {Colors.BRIGHT_GREEN}{format_tokens(total_output)}↑{Colors.WHITE} | {Colors.RED}{format_tokens(total_input)}↓{Colors.RESET}"

    # Format counts with color and developer icons
    counts = []
    if rules_count > 0:
        counts.append(f"{Colors.WHITE}📋 {rules_count} rules{Colors.RESET}")
    if mcps_count > 0:
        counts.append(f"{Colors.WHITE}⚡ {mcps_count} mcps{Colors.RESET}")
    if hooks_count > 0:
        counts.append(f"{Colors.WHITE}🔗 {hooks_count} hooks{Colors.RESET}")

    counts_str = f" {Colors.WHITE}|{Colors.RESET} ".join(counts) if counts else ""

    # Line 1: Project | Model | Version | Output Style | Branch | Time
    line1_parts = [
        f"{Colors.BLUE}📁 {project_name}{Colors.RESET}",
        f"{Colors.GREEN}🌿 {branch}{Colors.RESET}",
        f"{Colors.LIGHT_PURPLE}🤖 {model_name}{Colors.RESET}",
        f"{Colors.WHITE}🏷️ v{version}{Colors.RESET}",
        f"{Colors.WHITE}🎨 {output_style}{Colors.RESET}",
        f"{Colors.WHITE}🕐 {current_time}{Colors.RESET}"
    ]

    line1 = f" {Colors.WHITE}|{Colors.RESET} ".join(line1_parts)

    # Output all lines
    print(line1)
    print(context_str)
    print(usage_str)
    if counts_str:
        print(counts_str)

if __name__ == "__main__":
    main()