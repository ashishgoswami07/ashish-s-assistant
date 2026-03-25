# Ashish's Assistant

A modern, responsive AI chat assistant powered by Gemini 3 Flash.

## Deployment to Vercel

To deploy this project to Vercel, follow these steps:

1. **Push to GitHub**: Export your project to a GitHub repository from the AI Studio interface.
2. **Import to Vercel**: Go to [Vercel](https://vercel.com) and import your new repository.
3. **Configure Environment Variables**:
   - In the Vercel project settings, go to the **Environment Variables** tab.
   - Add a new variable named `GEMINI_API_KEY`.
   - Set the value to your Google Gemini API key (you can get one from [Google AI Studio](https://aistudio.google.com/app/apikey)).
   - **Important**: Make sure the variable is available for **Production**, **Preview**, and **Development** environments.
4. **Deploy**: Vercel will automatically detect the Vite configuration and build your project.

## Local Development

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file and add your `GEMINI_API_KEY`:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
