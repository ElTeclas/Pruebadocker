const mongoose = require('mongoose');

const mongoURI = process.env.MONGO_URI || 'mongodb://mongodb:27017/mqttDB';

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Conexión exitosa a MongoDB'))
  .catch(err => console.error('Error al conectar a MongoDB:', err))
  .finally(() => mongoose.disconnect());
