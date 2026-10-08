-- Se ejecuta una sola vez al crear el volumen. Base de pruebas separada de la
-- de desarrollo para que las pruebas de integración nunca borren datos locales.
CREATE DATABASE IF NOT EXISTS sirai_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON sirai_test.* TO 'sirai'@'%';
FLUSH PRIVILEGES;
