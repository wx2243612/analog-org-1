'use strict';

const database = require('../lib/database');
const customConfig = require('../config/customConfig');
const mongoose = require('mongoose');

const dbConfig = customConfig.databaseConfig;
database.config(dbConfig);

const Order = mongoose.model('Order');
const StrategyPlan = mongoose.model('StrategyPlan');
const Decimal = require('decimal.js');
const cacheClient = require('../lib/apiClient/cacheClient').getInstance();
const CacheClient = require('ws-client').CacheClient;
const strategyPlanLib = require('../lib/strategyPlan');

const INTERVAL = 4000; //4s
const NODE_ENV = process.env.NODE_ENV || 'production'; //development
const PLAN_ORDER_MAX_COUNT = 10; //全部计划最多能允许没有成交的订单笔数，如果超过这个数量，所有的策略计划必须停止

process.on('uncaughtException', function(e) {
    console.error(e);
});

let runned = false;
let db = mongoose.connection;
db.once('open',function callback(){
    console.log(`数据库连接成功。系统开始运行策略计划`);
    if(cacheClient.readyState == CacheClient.OPEN){
        setTimeout(runStrategys,INTERVAL);
    } else {
        cacheClient.start(function(){
            let client = cacheClient.getClient();
            client.on('pong',function(){
                console.log('pong');
            })

            if(NODE_ENV == 'production'){
                setTimeout(function(){
                    setInterval(runStrategyPlans,INTERVAL);
                },10000)
            } else {
                // if(!runned){
                //     setTimeout(runStrategyPlans,10000);
                //     runned = true;
                // }
                setTimeout(function(){
                    setInterval(runStrategyPlans,INTERVAL);
                },10000)
            }
        });    
    }
});

async function runStrategyPlans(){
    let result = [];
    let strategyPlans = await getStrategyPlans();
    if(strategyPlans.length == 0){
        console.log('没有需要运行的策略计划');
        return result;
    }

    try{
        for(let strategyPlan of strategyPlans){
            let ordersCount = getOrdersCountOfPlan(strategyPlan);
            if(ordersCount >= PLAN_ORDER_MAX_COUNT){
                console.log(`没有完成的订单多达${ordersCount}个，已超标，计划正在队列中等待...`);
                break;
            }

            let env = { userName: strategyPlan.userName };
            let options = {
                "env": env
            };
            let res = await strategyPlanLib.runStrategyPlan(strategyPlan,options);
            if(!res.isSuccess){
                console.log(`运行计划“${strategyPlan.name}”失败，返回错误信息: ${res.message}`);
            } else {
                console.log(`运行计划“${strategyPlan.name}”成功，返回信息: ${res.message}`);
            }
            result.push(res);
        }
    } catch (err){
        let res = { isSuccess: false,message: `系统错误:${err.message}` };
        result.push(res);
        console.error(err);
    }

    return result;
}

async function getStrategyPlans(){
    let isTest = (NODE_ENV  == 'production' ? false : true);
    let strategyPlans = await StrategyPlan.find({ 
        isValid: true,
        status: { $in: ['wait', 'running'] } 
    });
    return strategyPlans;
}

async function getOrdersCountOfPlan(strategyPlan){
    let now = new Date();
    let modifiedStart = new Date();
    modifiedStart.setTime(+now - 2 * 24 * 60 * 60 * 1000); //超过2天的就不处理了
    // let modifiedEnd = new Date();
    // modifiedEnd.setTime(+now - 0.5 * 60 * 1000); //超过0.5分钟还未成交的就修改价格

    let orders = await Order.find({ 
        userName: strategyPlan.userName,
        //modified: { $lt: modifiedEnd },
        modified: { $gt: modifiedStart},
        status: { $in: ['consign','part_success'] },  //,'auto_retry'
    });

     return orders.length;  
}


