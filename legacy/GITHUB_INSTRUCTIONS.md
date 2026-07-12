# How to Upload to GitHub and Build

## Step 1 — Create a GitHub account
If you don't have one, go to https://github.com and sign up for a free account.

## Step 2 — Create a new repository
1. Click the **+** icon in the top right of GitHub and choose **New repository**
2. Name it `tasknotes-timer`
3. Set it to **Private** (so only you can see it)
4. Leave everything else unchecked — do NOT add a README or .gitignore
5. Click **Create repository**

## Step 3 — Install Git on your Mac
Open Terminal and run:
```bash
git --version
```
If Git isn't installed, macOS will prompt you to install it. Follow the prompt.

## Step 4 — Add the workflow file to your project
Copy the `.github` folder from this download into the root of your project:
```
tasknotes-timer/
  .github/
    workflows/
      build.yml     ← copy this here
  src/
    main.js
    timer.html
    settings.html
  package.json
```

## Step 5 — Update package.json scripts
Make sure your package.json scripts section includes both build commands:
```json
"scripts": {
  "start": "electron .",
  "build:mac": "electron-builder --mac dmg",
  "build:win": "electron-builder --win"
}
```

## Step 6 — Add a .gitignore file
Create a file called `.gitignore` in your project root with this content:
```
node_modules/
dist/
```
This stops large generated folders being uploaded to GitHub.

## Step 7 — Initialise Git and push your project
In Terminal, navigate to your project folder and run these commands one by one:
```bash
cd ~/Documents/coding/tasknotes-timer

git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/tasknotes-timer.git
git push -u origin main
```
Replace YOUR_USERNAME with your actual GitHub username.

## Step 8 — Trigger a build
The workflow runs automatically when you push a version tag. To trigger it:
```bash
git tag v1.0.0
git push origin v1.0.0
```

Or you can trigger it manually:
1. Go to your repository on GitHub
2. Click the **Actions** tab
3. Click **Build TaskNotes Timer** in the left sidebar
4. Click **Run workflow** → **Run workflow**

## Step 9 — Download your builds
1. Click the **Actions** tab on GitHub
2. Click the latest workflow run
3. Wait for both jobs to complete (green ticks) — takes about 5 minutes
4. Scroll down to **Artifacts**
5. Download **TaskNotes-Timer-Mac** (DMG) and **TaskNotes-Timer-Windows** (EXE)

## Updating the app in future
Every time you make changes, run:
```bash
git add .
git commit -m "Description of your changes"
git push
```
Then to create a new build, tag it:
```bash
git tag v1.0.1
git push origin v1.0.1
```
