<?php

    function echoHeader($title){
        echo "
        <html>
            <head>
                <meta charset='UTF-8'>
                <title>$title</title>
                <link rel='stylesheet' href='style.css'>
            </head>
        ";
    }

    function echoFooter(){
        echo "
            </body>
        </html>
        ";
    };