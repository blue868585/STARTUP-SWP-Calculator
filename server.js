const express = require('express');
const path = require('path');
require('dotenv').config();

const { app } = require('./app');

app.use(express.static(path.join(__dirname)));

app.get('/advertise', (req, res) => {
  res.sendFile(path.join(__dirname, 'advertise.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
