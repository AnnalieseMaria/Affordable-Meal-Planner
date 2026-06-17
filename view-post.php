<?php
    include ('include/init.php');

    //ORIGINAL: $post_ID = $_REQUEST['postid'];
    //CHANGE I MADE FOR SECUIRTY PURPOSES BELOW: 
    $post_ID = filter_input(INPUT_GET, 'postid', FILTER_VALIDATE_INT, [
    'options' => [
        'min_range' => 1, 
        'max_range' => 2  
    ]
]);

    if ($post_ID === false || $post_ID === null) {
    http_response_code(404);
    header("Location: index.php"); 
      exit; 
}


    debugOutput($_GET);
    if(isset($_POST['commentContent'])) {
        $submittedContent = $_POST['commentContent'];
        // debugOutput($_POST);
         saveComment($submittedContent, $_SESSION['userId'], $post_ID); //we need '' aroudn userId cause its they key (name) of session variable, the integer it maps to is the value 
         header("Location: view-post.php?postid=$post_ID");
         exit; 
    }

    $comments = getComments($post_ID);
    $userIdArr = [];

    foreach($comments as $comment) {
        $userId = $comment['userId'];
        $userIdArr = [$userId]; 
    }

    $userIdString = implode(",", $userIdArr);
    $users = getUsersForCommentsOnPost($userIdString);


    echoHeader('Post');
    $postArr = getPost($post_ID);
    $postTitle = $postArr['title'];
    $postContent = $postArr['content'];
    $gallery = json_decode($postArr['gallery'], true);

    echo "<div class='photos-pages-header'>
            <h1>$postTitle</h1>
            <h4>$postContent</h4>
          </div>
          
        <div class='photo-grid'>

        ";

    foreach ($gallery as $item) {
        echo "
            <div class='grid-item'>
                <img src='{$item['image']}' alt=''>
                <div class='hover-text'>
                    <p>{$item['info']}</p>
                </div>
            </div>
        ";
    }
        echo " 
        </div>

        <form action=' ' method='POST'>
            <label for'commentContent'>comment content:</label>
            <input type='text' id='commentContent' name='commentContent'>
            
            <input type='submit' value='Submit'>
        </form>
        ";
       

    echo "
        <div class='comments-section-header'>
            <h4 style='font-size: 30px;'>Comments</h4>
          
        </div>

        <div class='comments-section'>
        ";
        
        foreach($comments as $comment){
            $userId = $comment['userId'];
            $commentUser = getUserForComment($userId);
            $userName = $commentUser['userName'];

            echo "<div class='comment'>
                    <p>@$userName</p>
                    <p>{$comment['content']}</p>
                    </div>
            ";
        }

    echo "
        </div>
    ";
    
    // //ADD IN SOME STYLING HERE FOR THE COMMENTS
    // foreach($comments as $comment){
    //     echo $comment['content']; 
    // }

    // var_dump($postArr);
    // debugOutput($postArr);
    echoFooter();

?>


