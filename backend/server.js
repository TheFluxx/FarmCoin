const express = require('express');
const { Sequelize, DataTypes, Op } = require('sequelize');
const { Client } = require('pg');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios'); // добавляем импорт axios
const fs = require('fs');

const app = express();
const port = 8000;

// Middleware
app.use(bodyParser.json());
app.use(cors()); // Добавьте эту строку для использования cors

// PostgreSQL connection settings
const dbName = 'farmclicker';
const dbUser = 'clicker_user';
const dbPassword = 'rootroot';
const dbHost = 'localhost';

// Create a client to connect to the default database (postgres) to create the target database and user
const client = new Client({
    user: 'postgres', // default postgres user
    host: dbHost,
    password: dbPassword, // password for the postgres user
    database: 'postgres' // connect to the default postgres database
});

async function initializeDatabase() {
    try {
        await client.connect();
        console.log('Connected to PostgreSQL database');

        await client.query(`CREATE DATABASE ${dbName};`);
        console.log(`Database ${dbName} created successfully`);

        await client.query(`CREATE USER ${dbUser} WITH ENCRYPTED PASSWORD '${dbPassword}';`);
        console.log(`User ${dbUser} created successfully`);

        await client.query(`GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser};`);
        console.log(`Granted all privileges on database ${dbName} to user ${dbUser}`);
    } catch (err) {
        if (err.code === '42P04') {
            console.log(`Database ${dbName} already exists.`);
        } else if (err.code === '42710') {
            console.log(`User ${dbUser} already exists.`);
        } else {
            console.error('Error initializing database:', err);
        }
    } finally {
        await client.end();
    }
}

// Initialize the database
initializeDatabase().then(() => {
    // PostgreSQL connection
    const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
        host: dbHost,
        dialect: 'postgres',
        dialectModule: require('pg'),
    });

    // Define User model
    const User = sequelize.define('User', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        telegram_id: {
            type: DataTypes.BIGINT,
            unique: true,
        },
        telegram_username: {
            type: DataTypes.STRING,
        },
        farm_coins: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
        },
        multitap: {
            type: DataTypes.INTEGER,
            defaultValue: 1,
        },
        able: {
            type: DataTypes.INTEGER,
            defaultValue: 6500,
        },
        energy: {
            type: DataTypes.INTEGER,
            defaultValue: 6500,
        },
        autofarm: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        current_skin: {
            type: DataTypes.STRING,
            defaultValue: './img/coin-btn.png',
        },
        skins: {
            type: DataTypes.ARRAY(DataTypes.STRING),
            defaultValue: ['./img/coin-btn.png'],
        },
        tasks_id_done: {
            type: DataTypes.ARRAY(DataTypes.INTEGER),
            defaultValue: [],
        },
        referer: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
    }, {
        timestamps: false,
        tableName: 'users'
    });

    // Define Task model
    const Task = sequelize.define('Task', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        name: {
            type: DataTypes.STRING,
        },
        description: {
            type: DataTypes.STRING,
        },
        img: {
            type: DataTypes.STRING,
        },
        reward: {
            type: DataTypes.INTEGER,
        },
        done: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        tg_id: {
            type: DataTypes.BIGINT,
        },
    }, {
        timestamps: false,
        tableName: 'tasks'
    });

    // Sync models
    sequelize.sync().then(() => {
        console.log('Database & tables created!');
    });

    // Function to periodically raise energy
    const raiseEnergy = async () => {
        try {
            const users = await User.findAll({
                where: {
                    able: {
                        [Op.lt]: Sequelize.col('energy')
                    }
                }
            });

            for (const user of users) {
                user.able += 10;
                await user.save();
            }

            console.log('Energy raised for users with able < energy');
        } catch (error) {
            console.error('Error raising energy:', error);
        }
    };

    // Set interval to call raiseEnergy function every 100 milliseconds
    setInterval(raiseEnergy, 1000);

    // Function to periodically raise energy
    const raiseAutoFarm = async () => {
        try {
            // Fetch users with autofarm set to true and able < energy
            const users = await User.findAll({
                where: {
                    autofarm: true,
                }
            });

            // Iterate over the users and update their able attribute
            for (const user of users) {
                user.farm_coins += 172400;
                await user.save();
            }

            console.log('Energy raised for users with autofarm true and able < energy');
        } catch (error) {
            console.error('Error raising energy:', error);
        }
    };
    const ONE_DAY_MS = 24 * 60 * 60 * 1000; // 86,400,000 milliseconds

    // Set interval to call raiseEnergy function every 1000 milliseconds (1 second)
    setInterval(raiseAutoFarm, ONE_DAY_MS);

    // Routes for User model
    app.post('/api/user', async (req, res) => {
        const { telegram_id, telegram_username, referer } = req.body;
        try {
            let user = await User.findOne({ where: { telegram_id } });
            if (!user) {
                user = await User.create({ telegram_id, telegram_username, referer });
            }
            res.status(200).json(user);
        } catch (error) {
            console.error('Error creating user:', error);
            res.status(400).json({ error: error.message });
        }
    });

    app.get('/api/user/:telegram_id', async (req, res) => {
        const { telegram_id } = req.params;
        try {
            const user = await User.findOne({ where: { telegram_id } });
            if (!user) {
                user = await User.create({ telegram_id });
                const user = await User.findOne({ where: { telegram_id } });

            }
            res.status(200).json(user);
        } catch (error) {
            console.error('Error fetching user:', error);
            res.status(400).json({ error: error.message });
        }
    });


    app.post('/api/clicks', async (req, res) => {
        const { telegram_id, clicks, energy } = req.body;
        try {
            const user = await User.findOne({ where: { telegram_id } });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            if (user.able >= 10) {
                user.farm_coins += clicks;
                user.able -= 10; // Обновляем значение энергии
                await user.save();
                return res.status(200).json(user);
            } else {
                return res.status(400).json({ error: 'Not enough energy' });
            }
        } catch (error) {
            console.error('Error updating clicks and energy:', error);
            return res.status(400).json({ error: error.message });
        }
    });

    app.post('/api/replenish-energy', async (req, res) => {
        const { telegram_id, energyToAdd } = req.body;

        try {
            const user = await User.findOne({ where: { telegram_id } });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            user.able += energyToAdd; // Пополняем значение энергии
            await user.save();

            return res.status(200).json(user);
        } catch (error) {
            console.error('Error replenishing energy:', error);
            return res.status(400).json({ error: error.message });
        }
    });

    // Routes for purchasing multitap, energy, and autofarm
    app.post('/api/buy/multitap', async (req, res) => {
        const { telegram_id, multitapPrice } = req.body;
        try {
            const user = await User.findOne({ where: { telegram_id } });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            if (user.farm_coins < multitapPrice) {
                return res.status(400).json({ error: 'Not enough farm coins' });
            }
            user.farm_coins -= multitapPrice;
            user.multitap += 1;
            await user.save();
            res.status(200).json(user);
        } catch (error) {
            console.error('Error purchasing multitap:', error);
            res.status(400).json({ error: error.message });
        }
    });

    app.post('/api/buy/energy', async (req, res) => {
        const { telegram_id, price } = req.body;
        try {
            const user = await User.findOne({ where: { telegram_id } });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            if (user.farm_coins < price) {
                return res.status(400).json({ error: 'Not enough farm coins' });
            }
            user.farm_coins -= price;
            user.energy += 500;
            user.able += 500;

            await user.save();
            res.status(200).json(user);
        } catch (error) {
            console.error('Error purchasing energy:', error);
            res.status(400).json({ error: error.message });
        }
    });

    app.post('/api/buy/autofarm', async (req, res) => {
        const { telegram_id, price } = req.body;
        try {
            const user = await User.findOne({ where: { telegram_id } });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            if (user.farm_coins < price) {
                return res.status(400).json({ error: 'Not enough farm coins' });
            }
            user.farm_coins -= price;
            user.autofarm = true;
            await user.save();
            res.status(200).json(user);
        } catch (error) {
            console.error('Error purchasing autofarm:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // Route for purchasing skins
    app.post('/api/buy/skin', async (req, res) => {
        const { telegram_id, price, skin } = req.body;
        try {
            const user = await User.findOne({ where: { telegram_id } });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            if (user.farm_coins < price) {
                return res.status(400).json({ error: 'Not enough farm coins' });
            }
            if (!user.skins.includes(skin)) {
                user.skins = [...user.skins, skin]; // Обновляем массив скинов
            }
            user.farm_coins -= price;
            await user.save();
            res.status(200).json(user);
        } catch (error) {
            console.error('Error purchasing skin:', error);
            res.status(400).json({ error: error.message });
        }
    });


    // Route for changing skins
    app.post('/api/change/skin', async (req, res) => {
        const { telegram_id, skin } = req.body;
        try {
            const user = await User.findOne({ where: { telegram_id } });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            if (!user.skins.includes(skin)) {
                return res.status(400).json({ error: 'Skin not owned' });
            }
            user.current_skin = skin;
            await user.save();
            res.status(200).json(user);
        } catch (error) {
            console.error('Error changing skin:', error);
            res.status(400).json({ error: error.message });
        }
    });

    // Routes for Task model
    app.post('/api/task', async (req, res) => {
        const { name, description, img, reward, tg_id } = req.body;
        try {
            const task = await Task.create({ name, description, img, reward, tg_id });
            res.status(200).json(task);
        } catch (error) {
            console.error('Error creating task:', error);
            res.status(400).json({ error: error.message });
        }
    });

    app.get('/api/task/:id', async (req, res) => {
        const { id } = req.params;
        try {
            const task = await Task.findOne({ where: { id } });
            if (!task) {
                return res.status(404).json({ error: 'Task not found' });
            }
            res.status(200).json(task);
        } catch (error) {
            console.error('Error fetching task:', error);
            res.status(400).json({ error: error.message });
        }
    });

    app.put('/api/task/:id', async (req, res) => {
        const { id } = req.params;
        const { done } = req.body;
        try {
            const task = await Task.findOne({ where: { id } });
            if (!task) {
                return res.status(404).json({ error: 'Task not found' });
            }
            task.done = done;
            await task.save();
            res.status(200).json(task);
        } catch (error) {
            console.error('Error updating task:', error);
            res.status(400).json({ error: error.message });
        }
    })

    const countUserReferrals = async (telegram_id) => {
        try {
            const referralCount = await User.count({
                where: {
                    referer: telegram_id
                }
            });
            return referralCount;
        } catch (error) {
            console.error('Error counting referrals:', error);
            throw error;
        }
    };

    // Маршрут для получения количества рефералов
    app.get('/api/user/:telegram_id/referrals', async (req, res) => {
        const { telegram_id } = req.params;
        try {
            const referralCount = await countUserReferrals(telegram_id);
            res.status(200).json({ referralCount });
        } catch (error) {
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    app.post('/api/check-subscription', async (req, res) => {
        const { telegram_id, channel_id, task_id, price } = req.body;

        // Логирование аргументов в файл
        const logData = `Received arguments:\ntelegram_id: ${telegram_id}\nchannel_id: ${channel_id}\ntask_id: ${task_id}\nprice: ${price}\n\n`;
        fs.appendFileSync('request_log.txt', logData);

        if (!telegram_id || !channel_id) {
            return res.status(400).json({ error: 'Missing telegram_id or channel_id' });
        }

        try {
            // Поиск пользователя в базе данных
            const user = await User.findOne({ where: { telegram_id } });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Проверка, выполнена ли задача
            if (user.tasks_id_done.includes(task_id)) {
                return res.status(200).json({ isMember: true });
            }

            // Проверка подписки пользователя через Telegram API
            const response = await axios.get(`https://api.telegram.org/bot${'7408731330:AAHzJ5MM3Czv-KAJh2s0KFgqtuZVesGretQ'}/getChatMember`, {
                params: {
                    chat_id: channel_id,
                    user_id: telegram_id,
                },
            });

            const isMember = response.data.result.status === 'member' || response.data.result.status === 'administrator' || response.data.result.status === 'creator';

            // Обновление записи в базе данных, если задача выполнена
            if (isMember && !user.tasks_id_done.includes(task_id)) {
                user.tasks_id_done = [...user.tasks_id_done, task_id];
                user.farm_coins += parseInt(price.replace(/\s/g, ''), 10); // Убираем пробелы и преобразуем price в число
                await user.save();
            }

            res.status(200).json({ isMember });
        } catch (error) {
            console.error('Error checking subscription:', error);
            res.status(400).json({ error: error.message });
        }
    });


    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}).catch(err => {
    console.error('Failed to initialize the database:', err);
});
