# Correct path for the compiled program .so file
# The actual compiled program is in target/deploy/ directory
PROGRAM_CRATE_NAME := solana_alt
PROGRAM_SO := target/deploy/$(PROGRAM_CRATE_NAME).so

# Phony targets to prevent conflicts with files of the same name
.PHONY: all build deploy help

# Default target
all: help

build:
	@echo "Building Solana program..."
	cargo build-sbf -- -Znext-lockfile-bump

deploy: build
	@echo "Deploying program from $(PROGRAM_SO)..."
	solana program deploy $(PROGRAM_SO)
	@echo "-----------------------------------------------------------------------------------"
	@echo "Program deployment initiated. Check output above for Program ID."
	@echo "Make sure to update your client.ts with the new Program ID."
	@echo "-----------------------------------------------------------------------------------"

help:
	@echo "Available Makefile commands:"
	@echo "  make build        - Build the Solana program"
	@echo "  make deploy       - Build and then deploy the Solana program"
	@echo "  make help         - Show this help message (default)"
	@echo ""
	@echo "For command-specific help:"
	@echo "  cargo build-sbf --help"
	@echo "  solana program deploy --help"

test:
	@echo "Running tests..."
	cargo test

	@echo "Tests completed successfully."

