<?php
    include('include/init.php');
    echoHeader('Home');

    $postArr = getPosts();

    echo "
        <body>
	
        <div class='full-screen-block'>
            <h1 style='text-align: center;'>Welcome to Annaliese's Blog</h1>
            
            <!-- how can i make there be less space between these two words? -->
            <h4 style='text-align: center;'>Click an image to discover more about me!</h4>

        <div class='main-container'> 
            
            <div class ='column'>

    ";
              
                foreach ($postArr as $post) {
                    $postID = $post['postId'];
                    $postImage = $post['image'];
        
                    echo "
                            <a href='view-post.php?postid=$postID' target='_blank'>
                            <img src='$postImage'>
                            </a>
                    ";
                }
    
    echo "

                 <a href='https://www.youtube.com/watch?v=7Wv5G58YRAU&list=RD7Wv5G58YRAU&start_radio=1' target='_blank'>
                    <img src='musicIcon.jpg'>
                </a>

            </div>
            
            <div class='column'>
                <a href='file2.php' target='_blank'>
                    <img src='readingIcon.jpg'>
                </a>

                <a href='poetry-page.php' target='_blank'>
                    <img src='poetryIcon.jpg'>
                </a>

                <a href='washu-page.php' target='_blank'>
                    <img src='washuIcon.jpg'>
                </a>
    ";

    // TODO: at this point loop through posts array and for each element in the posts array echo out
    // the a tag link to your post.  add different images to the array so that we can change it/ store images to include info we need 
    // foreach ($postArr as $post) {
    //     $postID = $post['postId'];
    //     $postImage = $post['image'];
    
    //     echo "
    //         <a href='view-post.php?postid=$postID' target='_blank'>
    //             <img src='$postImage'>
    //         </a>
    //     ";
    // }

    echo "
        </div>
            
            <div class='column'>
                <a href='movies-page.php' target='_blank'>
                    <img src='moviesIcon.jpg'>
                </a>



            </div>
    
          </div>

            <a href='https://www.youtube.com/watch?v=7Wv5G58YRAU&list=RD7Wv5G58YRAU&start_radio=1' class='youtube-button' target='_blank'>My YouTube Playlist</a>
            <a href='file2.html' target='_blank'>This is a link to file2</a>
    
        </div>
    ";
    echoFooter();
?>
    
	
            