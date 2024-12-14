
const mongoose = require('mongoose');

const uri = 'mongodb://mongodb:27017/mqttDB';

mongoose.connect(uri)
  .then(() => {
    console.log('Conexión exitosa a MongoDB');
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('Error al conectar a MongoDB:', err);
  });

