FROM node:21-slim

# Install curl
RUN apt-get update && \
    apt-get install -y curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy startup script
COPY compile_page.sh /compile_page.sh
RUN chmod +x /compile_page.sh

# Create Next.js project directory
WORKDIR /home/user/nextjs-app

# Create Next.js application
RUN npx --yes create-next-app@15.3.3 . --yes

# Initialize shadcn
RUN npx --yes shadcn@2.6.3 init --yes -b neutral --force
RUN npm install tw-animate-css

# Install required shadcn components
RUN npx --yes shadcn@2.6.3 add \
    button card input textarea dialog \
    dropdown-menu select tabs badge avatar \
    separator sheet skeleton tooltip \
    --yes

# Ensure correct permissions
RUN chown -R user:user /home/user/nextjs-app

# Switch to non-root user
USER user

WORKDIR /home/user/nextjs-app