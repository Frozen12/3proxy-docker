# Use a Python 3.13 Alpine base image for a smaller footprint
FROM python:3.13-alpine

# Set environment variables for Rclone installation
ENV DEBIAN_FRONTEND noninteractive

# Install necessary system dependencies for Alpine:
# curl for downloading rclone, unzip for extracting
# Clean up apk caches to reduce image size
RUN apk add --no-cache \
    curl \
    unzip \
    build-base \
    && rm -rf /var/cache/apk/*

# Install rclone using the "current" link for latest stable version
RUN set -eux; \
    # Download the latest rclone zip archive
    curl -fsSL "https://downloads.rclone.org/rclone-current-linux-amd64.zip" -o /tmp/rclone.zip; \
    \
    # Unzip the file - rclone creates a directory like rclone-*-linux-amd64
    unzip -q /tmp/rclone.zip -d /tmp/; \
    \
    # Move the rclone binary to /usr/local/bin (we know the exact path pattern)
    mv /tmp/rclone-*-linux-amd64/rclone /usr/local/bin/; \
    \
    # Clean up temporary files and directories
    rm -rf /tmp/rclone.zip /tmp/rclone-*-linux-amd64; \
    \
    # Make rclone executable
    chmod +x /usr/local/bin/rclone; \
    \
    # Verify rclone installation
    rclone version

# Set the working directory inside the container
WORKDIR /app

# Copy the application files into the container
COPY requirements.txt .
COPY app.py .
COPY templates/ templates/
COPY static/ static/

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Create necessary directories for rclone config (BASE_CONFIG_DIR).
# Service accounts will now be extracted directly into BASE_CONFIG_DIR by app.py.
ENV HOME /app
RUN mkdir -p /app/.config/rclone/

# Declare a volume for persistent storage of rclone config and SQLite database
VOLUME /app/.config/rclone

# Expose the port Flask will run on
EXPOSE 5000

# Command to run the application
# Using Gunicorn for production deployment with Flask
# --bind 0.0.0.0:${PORT} makes it listen on all interfaces and the port defined by Render
# --workers determines how many concurrent requests can be handled (adjust based on resources)
# --timeout increases the request timeout for potentially long Rclone operations
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "--timeout", "300", "--chdir", "/app", "app:app"]
