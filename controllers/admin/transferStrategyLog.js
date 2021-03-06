﻿'use strict';

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Account  = mongoose.model('Account');
const ClientIdentifier  = mongoose.model('ClientIdentifier');
const Strategy = mongoose.model('Strategy');
const TransferStrategyLog = mongoose.model('TransferStrategyLog');

const async = require('co').wrap;
const only = require('only');
const accountLib = require('../../lib/account');
const transfer = require('../../lib/transfer');
const transferController = require('../../lib/transferStrategys/transferController');

module.exports = function (router) {
    router.get('/', async(function* (req, res) {
        try{
            list(req,res,function(result){
                res.render('admin/transferStrategyLog', result);
            });
        } catch(err){
            console.error(err);
            res.json({ isSuccess: false, code: 500, message: "500:服务器端发生错误"});
        }
    }));

    router.post('/list', async(function* (req, res) {
        try{
            list(req,res,function(result){
                res.json(result);
            });
        } catch(err){
            console.error(err);
            res.json({ isSuccess: false, code: 500, message: "500:服务器端发生错误"});
        }
    }));

    router.post('/runTransferStep', async(function* (req, res) {     
        try{   
            let userName = req.user.userName;
            let sTransferId = req.param('transferId');
            let status = req.param('status');
            let transferId = mongoose.Types.ObjectId(sTransferId);

            res.json({ isSuccess: true });
        } catch(err){
            console.error(err);
            res.json({ isSuccess: false, code: 500, message: "500:服务器端发生错误"});
        }
    }));

    router.post('/finishTransferStep', async function(req, res) {
        try{
            let sStrategyStepId = req.body.strategyStepId;
            let strategyStepId;
            if(sStrategyStepId){
                strategyStepId = mongoose.Types.ObjectId(sStrategyStepId);
            }

            let stepLog = await TransferStrategyLog.aggregate(
                //{ $match: { "operates._id" : strategyStepId } },
                { $unwind:"$operates" },
                { $match: { "operates._id": strategyStepId } },
                { $group: { 
                    userName: "$userName", 
                    strategyId: "$strategyId", 
                    operate: { $first: "$operates" } }
                }
            ).exec();

            if(!stepLog){
                return res.json({ isSuccess: false,errorCode:"200000", message: "找不到执行记录!" });
            }
            
            await transferController.finishTransferStep(stepLog.operate);
            res.json({ isSuccess: true });
        } catch(err){
            console.error(err);
            res.json({ isSuccess: false, code: 500, message: "500:服务器端发生错误"});
        }
    });

    router.post('/updateStatus', async function(req, res) { 
        try{       
            let userName = req.user.userName;
            let sTransferId = req.param('transferId');
            let status = req.param('status');
            let transferId = mongoose.Types.ObjectId(sTransferId);

            let stepCallBack;
            await transfer.syncUserRecenttransfers(userName,sites,stepCallBack);
            res.json({ isSuccess: true });
        } catch(err){
            console.error(err);
            res.json({ isSuccess: false, code: 500, message: "500:服务器端发生错误"});
        }
    });
}

function list(req,res,callback){
    let sAuto = req.body.auto;
    let sStatus = req.body.status;

    let pageNumber = Number(req.body.page || '1') || 1;
    let pageSize = Number(req.body.rp || '10') || 10;

    let userName = req.user.userName;
    let query = { "$where": function(){
        // if(this.userName != userName){
        //     return false;
        // }
        return true;
    }};


    var options = {
        //select:   'title date author',
        sort: { modified : -1 },
        //populate: 'strategyId',
        lean: true,
        page: pageNumber, 
        limit: pageSize
    };

    TransferStrategyLog.paginate(query, options).then(async function(getRes) {
        let logs = [],orgLogs = getRes.docs || [];
        for(let log of orgLogs){
            //这里最好是使用pupulate
            let strategy = await Strategy.findById(log.strategyId);
            if(strategy){
                log.strategy = {
                    name: strategy.name,
                    _id: strategy._id
                }
            } else {
                log.strategy = {
                    name: '策略已被删除',
                    _id: null
                }
            }
            logs.push(log);
        }

        let t = {
            pageSize: getRes.limit,
            total: getRes.total,
            logs: JSON.stringify(logs || []),
            isSuccess: true
        };  

        callback(t);
    });
}