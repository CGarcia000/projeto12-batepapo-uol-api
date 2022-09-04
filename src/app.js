import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import joi from "joi";
import dayjs from "dayjs";
import dotenv from "dotenv";
dotenv.config();

const userSchema = joi.object({
    name: joi.string().required().trim(),
});

const messageSchema = joi.object({
    to: joi.string().required().trim(),
    text: joi.string().required().trim(),
    type: joi.string().required().lowercase().valid('message','private_message')
});

const app = express();

app.use(cors());
app.use(express.json());

//BD
const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

mongoClient.connect().then(() => {
    db = mongoClient.db("batepapo-uol");
});


// --- FUNCTIONS --- //

async function removeInactiveUsers() {
    try {
        const users = await db
            .collection('users')
            .find()
            .toArray();
            
        const inactiveIds = users
            .filter(user => Date.now() - user.lastStatus >= 10000)
            .map(user => user._id);
            
        await db
            .collection('users')
            .deleteMany({
                '_id': {$in: inactiveIds}
            })

    } catch(err) {
        console.log(err);
        return;
    }
}

setInterval(removeInactiveUsers, 15000);

// --- ROTES --- //

// participants

app.post('/participants', async (req, res) => {
    const validation = userSchema.validate(req.body, {abortEarly: false});
    
    if (validation.error) {
        const errors = validation.error.details.map(detail => detail.message);
        res.status(422).send(errors);
        return;
    }

    const { name } = validation.value;
    try {
        const userSameName = await db.collection('users').findOne({name: name});
        if (userSameName) {
            res.sendStatus(409);
            return;
        }

        await db.collection('users').insertOne({name: name, lastStatus: Date.now()});
        await db
            .collection('messages')
            .insertOne({
                from: name, 
                to: 'Todos', 
                text: 'entra na sala...', 
                type: 'status', 
                time: dayjs().format('HH:mm:ss')
            });
        res.sendStatus(201);

    } catch (err) {
        res.status(500).send(err.message);
        return;
    }
})

app.get('/participants', async (req, res) => {
    try {
        const users = await db.collection("users").find().toArray();
        const response = users.map(user => ({ name: user.name }));
        res.status(200).send(response);
    } catch (err) {
        res.status(500).send(err.message);
        return;
    }
})

// messages

app.post('/messages', async (req, res) => {
    const validation = messageSchema.validate(req.body, {abortEarly: false});
    
    if (validation.error) {
        const errors = validation.error.details.map(detail => detail.message);
        res.status(422).send(errors);
        return;
    }

    try {
        const users = await db.collection('users').find().toArray();
        const user = users.filter(user =>user.name === req.headers.user);
        if (user.length === 0 || user.length > 1) {
            res.sendStatus(422);
            return;
        }
        const userId = user[0]._id;

        await db
            .collection('messages')
            .insertOne({
                from: req.headers.user,
                to: validation.value.to,
                text: validation.value.text,
                type: validation.value.type,
                time: dayjs().format('HH:mm:ss')
            });

        await db
            .collection('users')
            .updateOne({
                _id: userId
            }, {$set: { lastStatus: Date.now() }})

        res.sendStatus(201);
    } catch (err) {
        res.status(500).send(err.message);
        return;
    }
})

app.get('/messages', async (req, res) => {
    let limit = parseInt(req.query.limit);
    if (!limit) limit = 100;

    try {
        const users = await db.collection('users').find().toArray();
        const user = users.filter(user =>user.name === req.headers.user);
        if (user.length === 0 || user.length > 1) {
            res.sendStatus(422);
            return;
        }

        const {name} = user[0];

        // query das mensagens permitidas para aquele usuário
        const messages = await db
            .collection('messages')
            .find({ 
                $or: [ 
                    { type: { $in: ["message", "status"] }},
                    { type: "private_message", to: name },
                    { type: "private_message", from: name }
                ]
            })
            .sort({time:-1})
            .limit(limit)
            .toArray();

        messages.map(message => { delete message._id})
        res.status(200).send(messages.reverse());
    } catch (err) {
        res.status(500).send(err.message);
        return;
    }
})

// status

app.post('/status', async (req, res) => {
    try {
        const users = await db.collection('users').find().toArray();
        const user = users.filter(user =>user.name === req.headers.user);
        if (user.length === 0 || user.length > 1) {
            res.sendStatus(404);
            return;
        }
        const userId = user[0]._id;

        await db
            .collection('users')
            .updateOne({
                _id: userId
            }, {$set: { lastStatus: Date.now() }})
        res.sendStatus(200);
    } catch(err) {
        res.status(500).send(err.message);
        return;
    }
})


app.listen(5000);


