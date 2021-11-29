const path = require('path');

const entry = './src/index.js';
const output = {
  filename: 'main.js',
  path: path.resolve(__dirname, 'dist'),
  publicPath: '/',
};

module.exports = {
  entry,
  output,
  devServer: {
    static: './dist',
  },
};
