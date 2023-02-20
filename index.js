const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
require('dotenv').config()
const app = express();


//middleware
app.use(cors())
app.use(express.json())

 



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.i8hxp3j.mongodb.net/?retryWrites=true&w=majority`;
 
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


 function jwtVerify(req, res, next){
    //console.log(req.headers.authorization);
    const authHeader = req.headers.authorization;
    //console.log(authHeader)

    if(!authHeader){
        return res.status(401).send('unAuthorazid access')
    }
    //split kore token k alada kora hoyece
    const token = authHeader.split(' ')[1]
    //console.log(token);

    jwt.verify(token, process.env.ACCESS_TOKEN, function(err, decoded){
        if(err){
            return res.status(403).send({message : 'forbiden access'})
        }
        req.decoded = decoded;
        next()
    })
    
    
 }
 

 async function run(){
    try{
        const appionmentsOptionsCollections = client.db('doctorsPortal').collection('appionmentSlots')
        const bookingsCollections = client.db('doctorsPortal').collection('bookings')
        const  usersCollections = client.db('doctorsPortal').collection('users')


        app.get('/appionmentoptions', async(req, res) => {
            const date = req.query.date;
           //console.log(date)
            const query ={}
            const options = await appionmentsOptionsCollections.find(query).toArray();
           
           //date diye query kora hoyece jate j slots gula booking kora hoyece se gula cara baki gula treatment option a show korano jai 
            const bookingQuery = {appionmentDate : date}
            const alreadyBooked  = await bookingsCollections.find(bookingQuery).toArray();  
             //console.log(alreadyBooked)

            options.forEach(singleOption => {

                const optionBooked = alreadyBooked.filter(bookOption => bookOption.treatment === singleOption.name )
                const bookedSlots = optionBooked.map(book => book.slot) 
                const remainingSlots = singleOption.slots.filter(slot => !bookedSlots.includes(slot))
            
                //console.log(singleOption.name, remainingSlots.length)
                singleOption.slots = remainingSlots
            })
           
            res.send(options)
        })



        //booking post
        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            //console.log(booking);
            const query = {
                appionmentDate: booking.appionmentDate,
                email: booking.email,
                treatment: booking.treatment 
            }
            //console.log(query)
            const alReadyBooked = await bookingsCollections.find(query).toArray();
            //console.log(alReadyBooked.length)

            if(alReadyBooked.length){
                const message =`you alredy hav a booking on ${booking.appionmentDate}`
                return res.send({acknowledged: false, message})
            }

             
            const resualt = await bookingsCollections.insertOne(booking)
            res.send(resualt)
        })

        //get bookings by email
        app.get('/bookings', jwtVerify, async(req,res) => {
            const email = req.query.email;
            // console.log(email)
            const decodedEmail = req.decoded.email;
            // console.log(decodedEmail)

            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }

            const query = { email: email}
            const resualt = await bookingsCollections.find(query).toArray();
            res.send(resualt)
        })

        //jwt --> server a jodi user thake tahle token dibe (101 line a user server create kora hoyece)
        app.get('/jwt', async(req, res) => {
            const email = req.query.email 
             
            const query ={ email: email }
            const user = await usersCollections.findOne(query)
            if(user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn : '7d' })
                return res.send ({accessToken : token})
            }
            
            res.status(403).send({ accessToken : ''})
        })

        app.get('/users', async( req, res) => {
            const query = {}
            const users = await usersCollections.find(query).toArray()
            res.send(users);
        })


        //users information
        app.post('/users', async(req,res) => {
            const user = req.body;
            const resualt = await usersCollections.insertOne(user);
            res.send(resualt)
        })





    }
    finally{

    }
}
run().catch(console.log())








//test
app.get('/', async(req, res )=> {
    res.send('doctors portal running')
})

app.listen(port, () => console.log(`doctors portal running on ${port}`))