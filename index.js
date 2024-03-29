const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
require('dotenv').config()
const app = express();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);


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
        const  doctorsCollections = client.db('doctorsPortal').collection('doctors')
        const  paymentsCollections = client.db('doctorsPortal').collection('payments')

        //NOTE: make sure allwayes use after jwtVerify function
        //verify Admin
        const verifyAdmin = async (req, res, next) => {
            //console.log(req.decoded.email)
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollections.findOne(query);

            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next()
        }


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

        //get only specialty name from appionmentsOptionsCollections
        //find(query).project({ name: 1})----> diye specific data select kora hoi.
        //jmn project({ name : 1}) --> name database a save cilo abong segula diye sudhu matro sob name gula k pawa gece. same vabe 
        //project({ slots : 1}) ----> dile sokol slots gula k pawa jabe
        app.get('/appionmentsspecialty', async( req, res) => {
            const query ={}
            const resualt = await appionmentsOptionsCollections.find(query).project({ name: 1}).toArray()
            res.send(resualt)
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
            //  console.log(email)
            const decodedEmail = req.decoded.email;
            // console.log(decodedEmail)

            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }

            const query = { email: email}
            const resualt = await bookingsCollections.find(query).toArray();
            res.send(resualt)
        })

        //get specific booking
        app.get('/bookings/:id', async(req,res) => {
            const id = req.params.id;
            const query = { _id : new ObjectId(id)}
            const resualt = await bookingsCollections.findOne(query)
            res.send(resualt)
        })



        //PAYMENT
        app.post("/create-payment-intent", async (req, res) =>{
            const booking = req.body;
            const price = booking.price;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: "usd",
                amount : amount,
                "payment_method_types": [
                    "card"
                  ],
            })

            res.send({
                clientSecret: paymentIntent.client_secret,
              });


        })


        app.post('/payments', async(req,res) => {
            const payment = req.body;
            const resualt = await paymentsCollections.insertOne(payment)
            const id = payment.bookingId;
            const  filter = { _id : new ObjectId(id)}
            const updatedDoc = {
                $set : {
                    paid : true,
                    transtionId : payment.transctionId
                }
            }
            const updateResualt = await bookingsCollections.updateOne(filter, updatedDoc)
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

        //check kortece admin ki na  jodi hoi tahle allUser route k dekhte dbe. useAdmin hook a kaj kora hoyece. email diye kora hoyece karon user jkn login korbe tkn id thake na email thake tai email diye kora hoyece
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email : email }
            const user = await usersCollections.findOne(query);
            res.send({ isAdmin: user?.role === 'admin' });
        })


        //users information
        app.post('/users', async(req,res) => {
            const user = req.body;
            const resualt = await usersCollections.insertOne(user);
            res.send(resualt)
        })


        //make admin api and create admin: ----> next work '/users/admin/:email'  this api
        //jwtVerify-----> token verify kore
        //verifyAdmin---> admin verify kore
        app.put('/users/admin/:id', jwtVerify, verifyAdmin, async( req, res) => {
            //make admin work 
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollections.updateOne(filter, updatedDoc, options);
            res.send(result);
        })

        //temporary to update price options bookings: when change the option price call the api by default is comment
        // app.get('/addprice', async(req,res) => {
        //     const  filter ={}
        //     const options ={ upsert : true }
        //      const updatedDoc = {
        //         $set: {
        //              price: 99
        //         }
        //     }
        //     const resualt = await appionmentsOptionsCollections.updateMany(filter, updatedDoc,options)
        //     res.send(resualt)
        // })

        //get doctors..
        app.get('/doctors', jwtVerify, verifyAdmin, async( req, res) => {
            const query = {}
            const doctors = await doctorsCollections.find(query).toArray();
            res.send(doctors)
        })


        //doctor collection
        app.post('/doctors', jwtVerify, verifyAdmin, async( req, res )=> {
            const doctor = req.body
            const resualt = await doctorsCollections.insertOne(doctor)
            res.send(resualt)
        })

        //delete doctor
        app.delete('/doctors/:id', jwtVerify, verifyAdmin, async(req, res) => {
            const id = req.params.id;
            console.log(id)
            const filter = {_id : new ObjectId(id)}
            const resualt = await doctorsCollections.deleteOne(filter);
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