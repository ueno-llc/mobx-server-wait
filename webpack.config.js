var webpack = require('webpack');

module.exports = {
  entry: './src/index.js',
  output: {
    libraryTarget: 'umd',
    library: 'mobxServerWait',
    path: __dirname,
    filename: 'mobx-server-wait.umd.js'
  },
  resolve: {
    extensions: ['', '.js'],
  },
  externals: {
    mobx: 'mobx',
    react: 'react',
  },
  module: {
    loaders: [{
      test: /\.js$/,
      loader: 'babel-loader',
      exclude: [/node_modules/],
    }],
  },
  plugins: [
    new webpack.optimize.UglifyJsPlugin({
      compress: {
        warnings: false,
      },
    }),
  ],
};
