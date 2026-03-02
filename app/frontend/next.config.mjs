/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    basePath: '/tweetpredict',
    trailingSlash: true,
    output: 'export',
    images: {
        unoptimized: true
    },
    webpack: (config) => {
        config.externals.push('pino-pretty', 'lokijs', 'encoding');
        return config;
    },
};

export default nextConfig;
