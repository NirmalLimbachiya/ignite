#!/bin/bash
set -e

REPO="dev-dami/ignite"
INSTALL_DIR="${IGNITE_INSTALL_DIR:-$HOME/.ignite}"
BIN_DIR="$INSTALL_DIR/bin"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

info() { echo -e "${BLUE}>${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }
step() { echo -e "\n${CYAN}${BOLD}[$1/4]${NC} $2"; }

print_banner() {
    echo ""
    echo -e "${CYAN}"
    cat << 'EOF'
    ╦╔═╗╔╗╔╦╔╦╗╔═╗
    ║║ ╦║║║║ ║ ║╣ 
    ╩╚═╝╝╚╝╩ ╩ ╚═╝
EOF
    echo -e "${NC}"
    echo -e "  ${DIM}Run JS/TS microservices in Docker${NC}"
    echo ""
}

detect_platform() {
    local os arch

    case "$(uname -s)" in
        Linux*)  os="linux" ;;
        Darwin*) os="darwin" ;;
        MINGW*|MSYS*|CYGWIN*) error "Windows is not supported. Use WSL2." ;;
        *)       error "Unsupported OS: $(uname -s)" ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64)  arch="x64" ;;
        arm64|aarch64) arch="arm64" ;;
        *)             error "Unsupported arch: $(uname -m)" ;;
    esac

    echo "${os}-${arch}"
}

get_latest_version() {
    curl -sL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/'
}

check_existing() {
    if [ -f "$BIN_DIR/ignite" ]; then
        local current
        current=$("$BIN_DIR/ignite" --version 2>/dev/null || echo "unknown")
        warn "Already installed: $current"
        echo -ne "    Reinstall? [y/N] "
        read -r reply
        if [[ ! "$reply" =~ ^[Yy]$ ]]; then
            info "Cancelled"
            exit 0
        fi
    fi
}

download_binary() {
    local version="$1"
    local platform="$2"
    local url="https://github.com/${REPO}/releases/download/${version}/ignite-${platform}.tar.gz"
    local tmp_dir
    tmp_dir=$(mktemp -d)

    info "URL: ${DIM}$url${NC}"
    
    if command -v curl &> /dev/null; then
        if ! curl -fSL --progress-bar "$url" -o "$tmp_dir/ignite.tar.gz"; then
            rm -rf "$tmp_dir"
            echo ""
            error "Download failed. Release may not exist.\n    Check: https://github.com/${REPO}/releases"
        fi
    elif command -v wget &> /dev/null; then
        if ! wget -q --show-progress "$url" -O "$tmp_dir/ignite.tar.gz"; then
            rm -rf "$tmp_dir"
            error "Download failed. Check: https://github.com/${REPO}/releases"
        fi
    else
        error "curl or wget required"
    fi

    echo "$tmp_dir"
}

install_binary() {
    local tmp_dir="$1"
    local platform="$2"

    mkdir -p "$BIN_DIR"
    mkdir -p "$INSTALL_DIR/runtime-bun"
    mkdir -p "$INSTALL_DIR/runtime-node"

    info "Extracting..."
    tar -xzf "$tmp_dir/ignite.tar.gz" -C "$tmp_dir"

    cp "$tmp_dir/ignite-${platform}" "$BIN_DIR/ignite"
    chmod +x "$BIN_DIR/ignite"

    [ -d "$tmp_dir/runtime-bun" ] && cp -r "$tmp_dir/runtime-bun/"* "$INSTALL_DIR/runtime-bun/" 2>/dev/null || true
    [ -d "$tmp_dir/runtime-node" ] && cp -r "$tmp_dir/runtime-node/"* "$INSTALL_DIR/runtime-node/" 2>/dev/null || true

    rm -rf "$tmp_dir"
    success "Installed to $BIN_DIR/ignite"
}

setup_path() {
    local shell_rc path_export
    path_export="export PATH=\"\$PATH:$BIN_DIR\""

    if [ -f "$HOME/.zshrc" ]; then
        shell_rc="$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then
        shell_rc="$HOME/.bashrc"
    elif [ -f "$HOME/.config/fish/config.fish" ]; then
        shell_rc="$HOME/.config/fish/config.fish"
        path_export="set -gx PATH \$PATH $BIN_DIR"
    elif [ -f "$HOME/.profile" ]; then
        shell_rc="$HOME/.profile"
    fi

    if echo "$PATH" | grep -q "$BIN_DIR"; then
        success "PATH already configured"
        return
    fi

    if [ -n "$shell_rc" ]; then
        if ! grep -q "$BIN_DIR" "$shell_rc" 2>/dev/null; then
            echo -e "\n# Ignite CLI\n$path_export" >> "$shell_rc"
            success "Added to PATH in $(basename "$shell_rc")"
        else
            success "PATH configured"
        fi
    else
        warn "Add manually: $path_export"
    fi
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        warn "Docker not found (required)"
        echo -e "    ${DIM}https://docs.docker.com/get-docker/${NC}"
        return 1
    fi
    
    if ! docker info &> /dev/null 2>&1; then
        warn "Docker not running"
        return 1
    fi
    
    success "Docker ready"
}

print_success() {
    local shell_name="bashrc"
    [ -f "$HOME/.zshrc" ] && shell_name="zshrc"
    
    echo ""
    echo -e "${GREEN}${BOLD}  Done!${NC}"
    echo ""
    echo -e "  ${DIM}Next steps:${NC}"
    echo -e "    ${YELLOW}source ~/.$shell_name${NC}  ${DIM}# or restart terminal${NC}"
    echo -e "    ${YELLOW}ignite init hello && cd hello && ignite run .${NC}"
    echo ""
}

main() {
    print_banner

    step 1 "Detecting platform"
    local platform
    platform=$(detect_platform)
    success "$platform"
    
    check_existing

    step 2 "Fetching version"
    local version="${1:-$(get_latest_version)}"
    [ -z "$version" ] && error "No releases found"
    success "$version"

    step 3 "Installing"
    local tmp_dir
    tmp_dir=$(download_binary "$version" "$platform")
    install_binary "$tmp_dir" "$platform"
    setup_path

    step 4 "Checking Docker"
    check_docker || true

    print_success
}

main "$@"
