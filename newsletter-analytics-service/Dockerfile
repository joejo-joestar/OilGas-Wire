# Use an official Node.js runtime as a parent image
FROM node:20-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install application dependencies
RUN npm install --only=production

# Bundle app source
COPY . .

# App binds to port 8080 so you'll use the ENV PORT variable
EXPOSE 8080

# Define the command to run app
CMD ["npm", "start"]
